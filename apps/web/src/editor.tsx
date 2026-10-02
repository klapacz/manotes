import "./editor.css";

import { createEditor, Priority, union, withPriority } from "prosekit/core";
import { ProseKit } from "./lib/editor/prosekit-solid";
import { createMemo, Show, untrack, type Accessor } from "solid-js";
import type { JSX } from "@solidjs/web";
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
import { EditorSyncService, MatchTag } from "./lib";
import { runStream } from "./lib/solid-effect";
import { getProsemirrorXmlFragment } from "./lib/prosemirror/yjs";
import { Cause, Data, Deferred, Effect, Queue, Stream } from "effect";
import BacklinkMenu, { TabMenu } from "./lib/editor/backlink/menu";
import { Focus } from "./components/note/focus";
import type { NoteSchema } from "./lib/note.schema";
import { EditorFocus } from "./lib/editor/focus.extension";

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

type Props = {
  noteId: NoteSchema.Id;
  attached?: boolean;
  /** Receives the editor's boot state accessor once, during setup. */
  onBootState?: (bootState: Accessor<BootState>) => void;
  style?: JSX.CSSProperties;
};

export default function Editor(props: Props): JSX.Element {
  const focus = Focus.use();

  // The editor stack is recreated per note-id boundary so future route/view
  // changes can swap notes in-place without leaking Y.Doc/editor state.
  const state = createMemo(() => {
    const noteId = props.noteId;

    return untrack(() => {
      const doc = new Y.Doc();

      const extension = union([
        defineYjs({ doc }),
        defineAppExtension(),
        EditorFocus.define(() => focus.requestParent()),
      ]);

      const editor = createEditor({ extension });

      return {
        doc,
        editor,
        noteId,
      };
    });
  });

  // The boot stream owns the doc's sync session; superseding or disposing the
  // memo interrupts it and destroys the doc.
  const boot = createMemo<BootStateSnapshot | undefined>(
    () => {
      const { doc, noteId } = state();

      return runStream(bootStates(doc, noteId));
    },
    { loadingValue: undefined },
  );

  // A stale snapshot from the previous note reads as Loading for the new doc.
  const bootState = createMemo((): BootState => {
    const snapshot = boot();

    return snapshot?.doc === state().doc ? snapshot.state : BootState.Loading();
  });

  untrack(() => props.onBootState?.(bootState));

  const fid = Focus.useId();

  const fnode = Focus.createNode(() => ({
    id: fid.editor(props.noteId),
    enabled: (props.attached ?? true) && BootState.$is("Ready")(bootState()),
    focus: (_element, options) => {
      // The pooled view already has a live, transaction-mapped selection.
      const view = state().editor.view;
      view.focus();

      if (options?.reveal) view.dispatch(view.state.tr.scrollIntoView());
    },
  }));

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
            ref={(element) => {
              current.editor.mount(element);
              fnode.setElement(element);
            }}
            class="outline-none p-6 pt-0"
            style={props.style}
          />
          <BacklinkMenu currentNoteId={props.noteId} />
          <TabMenu />
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

function bootStates(doc: Y.Doc, noteId: NoteSchema.Id) {
  return Stream.callback((queue: Queue.Queue<BootStateSnapshot, Cause.Done>) =>
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() => Effect.sync(() => doc.destroy()));
      Queue.offerUnsafe(queue, { doc, state: BootState.Loading() });

      const ready = yield* Deferred.make<void>();
      const service = yield* EditorSyncService.Service;

      yield* Effect.all(
        [
          Effect.scoped(service.setupDoc(doc, { noteId }, ready)),
          Deferred.await(ready).pipe(
            Effect.andThen(
              Effect.sync(() => Queue.offerUnsafe(queue, { doc, state: BootState.Ready() })),
            ),
          ),
        ],
        { concurrency: "unbounded" },
      ).pipe(
        Effect.catchCause((cause) =>
          Cause.hasInterruptsOnly(cause)
            ? Effect.void
            : Effect.sync(() =>
                Queue.offerUnsafe(queue, {
                  doc,
                  state: BootState.Error({ message: EDITOR_LOAD_ERROR_MESSAGE }),
                }),
              ),
        ),
        Effect.forkScoped,
      );
    }),
  );
}
