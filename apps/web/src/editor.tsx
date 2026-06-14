import "./editor.css";

import { createEditor, defineKeymap, Priority, union, withPriority } from "prosekit/core";
import { Selection } from "prosekit/pm/state";
import { ProseKit } from "prosekit/solid";
import { createEffect, createMemo, on, Show, type JSX } from "solid-js";
import * as Y from "yjs";
import {
  defineYjsCommands,
  defineYjsKeymap,
  defineYjsSyncPlugin,
  defineYjsUndoPlugin,
  type YjsSyncPluginOptions,
  type YjsUndoPluginOptions,
} from "prosekit/extensions/yjs";
import { defineAppExtension } from "./editor.extension";
import { EditorSyncService, MatchTag, bindRt, createSyncedAtom } from "./lib";
import { getProsemirrorXmlFragment } from "./lib/prosemirror/yjs";
import { Cause, Data, Deferred, Effect, SubscriptionRef } from "effect";
import { AsyncResult, type Atom } from "effect/unstable/reactivity";
import BacklinkMenu from "./lib/editor/backlink/menu";
import { useAtomValue } from "@effect/atom-solid";
import { Focus } from "./components/note/focus";

export type BootState = Data.TaggedEnum<{
  Loading: {};
  Ready: {};
  Error: { message: string };
}>;

type BootStateSnapshot = {
  doc: Y.Doc;
  state: BootState;
};

export const BootState = Data.taggedEnum<BootState>();
const EDITOR_LOAD_ERROR_MESSAGE = "Failed to load note content.";

type Props = EditorSyncService.SetupInput & {
  onBootStateChange?: (state: BootState) => void;
  style?: JSX.CSSProperties;
};

export default function Editor(props: Props): JSX.Element {
  // The editor stack is recreated per note-id boundary so future route/view
  // changes can swap notes in-place without leaking Y.Doc/editor state.
  const state = createMemo(
    on(
      () => props.noteId,
      (noteId) => {
        const doc = new Y.Doc();
        const extension = union([
          defineYjs({ doc }),
          defineAppExtension(),
          defineKeymap({
            Escape: () => {
              fnode.focusParent();
              return true;
            },
          }),
        ]);
        const editor = createEditor({ extension });

        return {
          doc,
          editor,
          noteId,
        };
      },
      // Build the first editor state immediately so render/effect can consume it
      // on initial mount without waiting for the first dependency change.
      { defer: false },
    ),
  );

  const editorStateAtom = createSyncedAtom(() => {
    const current = state();
    return {
      doc: current.doc,
      noteId: current.noteId,
    };
  });

  const ready = Deferred.makeUnsafe<void>();

  const editorBootStateAtom = bindRt((rt) =>
    rt.subscriptionRef(
      Effect.fn("Editor.bootState")(function* (get: Atom.AtomContext) {
        const { doc, noteId } = get(editorStateAtom);
        yield* Effect.addFinalizer(() => Effect.sync(() => doc.destroy()));

        const bootStateRef = yield* SubscriptionRef.make<BootStateSnapshot>({
          doc,
          state: BootState.Loading(),
        });

        yield* Effect.gen(function* () {
          const service = yield* EditorSyncService.Service;

          yield* Effect.all(
            [
              Effect.scoped(service.setupDoc(doc, { noteId }, ready)),
              Effect.gen(function* () {
                yield* Deferred.await(ready);
                yield* SubscriptionRef.set(bootStateRef, { doc, state: BootState.Ready() });
              }),
            ],
            { concurrency: "unbounded" },
          );
        }).pipe(
          Effect.catchCause((cause) => {
            if (Cause.hasInterruptsOnly(cause)) return Effect.void;
            return SubscriptionRef.set(bootStateRef, {
              doc,
              state: BootState.Error({ message: EDITOR_LOAD_ERROR_MESSAGE }),
            });
          }),
          Effect.forkScoped,
        );

        return bootStateRef;
      }),
    ),
  );

  const bootStateResult = useAtomValue(editorBootStateAtom);
  const bootState = createMemo(() => {
    const currentDoc = state().doc;
    const result = bootStateResult();

    // Runtime atoms keep the previous successful value while the next async read
    // is spinning up. Tagging boot state with the Y.Doc lets us ignore that stale
    // Ready/Error from the previous note and keep the new session in Loading.
    if (result._tag === "Success") {
      return result.value.doc === currentDoc ? result.value.state : BootState.Loading();
    }

    return AsyncResult.matchWithError(result, {
      onInitial: () => BootState.Loading(),
      onSuccess: () => BootState.Loading(),
      onError: () => BootState.Error({ message: EDITOR_LOAD_ERROR_MESSAGE }),
      onDefect: () => BootState.Error({ message: EDITOR_LOAD_ERROR_MESSAGE }),
    });
  });

  createEffect(() => {
    props.onBootStateChange?.(bootState());
  });

  const focusEnd = Effect.fn("Editor.focusEnd")(function* () {
    yield* Deferred.await(ready);

    const editor = state().editor;
    if (bootState()._tag !== "Ready") return;

    const view = editor.view;
    view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)));
    view.focus();
  });

  const fnode = Focus.createNode(() => ({
    id: Focus.useId().editor(props.noteId),
    focus: () => Effect.runPromise(focusEnd()),
    onKeyDown: (event) => {
      if (event.key !== "Escape") return;
      fnode.focusParent();
      return true;
    },
  }));

  let suppressNextFocus = false;
  fnode.createChangeListener(() => (suppressNextFocus = false));

  return (
    <Show when={state()} keyed>
      {(current) => (
        <ProseKit editor={current.editor}>
          <MatchTag
            when={bootState()}
            cases={{
              Error: (value) => <p class="text-error-fg mb-3 text-sm">{value().message}</p>,
            }}
          />
          <div
            ref={current.editor.mount}
            class="outline-none"
            style={props.style}
            onMouseDown={(event) => {
              const target = event.target;
              if (!(target instanceof HTMLElement)) return;
              if (target.closest("[data-backlink]")) {
                suppressNextFocus = true;
                event.stopPropagation();
              }
            }}
            onFocusIn={() => {
              if (suppressNextFocus) return;
              fnode.focusSelf?.();
            }}
          />
          <BacklinkMenu currentNoteId={props.noteId} />
        </ProseKit>
      )}
    </Show>
  );
}

export interface YjsOptions {
  doc: Y.Doc;
  fragment?: Y.XmlFragment;
  sync?: YjsSyncPluginOptions;
  undo?: YjsUndoPluginOptions;
}

/**
 * @public
 */
export function defineYjs(options: YjsOptions) {
  const { doc, sync, undo } = options;
  const fragment = options.fragment ?? getProsemirrorXmlFragment(doc);

  return withPriority(
    union([
      defineYjsKeymap(),
      defineYjsCommands(),
      defineYjsUndoPlugin({ ...undo }),
      defineYjsSyncPlugin({ ...sync, fragment }),
    ]),
    Priority.high,
  );
}
