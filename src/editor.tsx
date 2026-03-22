import "./editor.css";

import { createEditor, Priority, union, withPriority } from "prosekit/core";
import { Selection } from "prosekit/pm/state";
import { ProseKit } from "prosekit/solid";
import {
  createEffect,
  createMemo,
  createSignal,
  on,
  onCleanup,
  Show,
  type JSX,
} from "solid-js";
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
import { EditorSyncService, useRuntime } from "./lib";
import { defineVirtualDailyHeading } from "./editor.virtual-daily-heading.extension";
import { formatDailyNoteTitle } from "./lib/daily-note";
import { Cause, Data, Fiber, Effect, Deferred } from "effect";
import BacklinkMenu from "./lib/editor/backlink/menu";
import { MatchTagged } from "./lib/compoennts/match-tagged";

export type BootState = Data.TaggedEnum<{
  Loading: {};
  Ready: {};
  Error: { message: string };
}>;

const BootState = Data.taggedEnum<BootState>();

type Props = EditorSyncService.SetupInput & {
  onFocusIn?: () => void;
  onBootStateChange?: (state: BootState) => void;
  autoFocus?: boolean;
  style?: JSX.CSSProperties;
};

export default function Editor(props: Props): JSX.Element {
  const runtime = useRuntime();

  // The editor stack is recreated per note-id boundary so future route/view
  // changes can swap notes in-place without leaking Y.Doc/editor state.
  const state = createMemo(
    on(
      () => props.noteId,
      (noteId) => {
        const doc = new Y.Doc();
        const extension = union([
          defineYjs({ doc }),
          defineAppExtension({ isDaily: props.isDaily }),
          // Daily title is virtual (render-only), not part of persisted doc content.
          ...(props.isDaily
            ? [
                defineVirtualDailyHeading({
                  title: formatDailyNoteTitle(noteId),
                }),
              ]
            : []),
        ]);
        const editor = createEditor({ extension });

        return {
          doc,
          editor,
          noteId,
          isDaily: props.isDaily,
        };
      },
      // Build the first editor state immediately so render/effect can consume it
      // on initial mount without waiting for the first dependency change.
      { defer: false },
    ),
  );

  const [bootState, _setBootState] = createSignal<BootState>(
    BootState.Loading(),
  );
  const setBootState = (state: BootState) => {
    _setBootState(state);
    props.onBootStateChange?.(state);
  };

  createEffect(() => {
    setBootState(BootState.Loading());
    const r = runtime();
    const { doc, noteId, isDaily } = state();
    let disposed = false;

    const fiber = r.runFork(
      Effect.catchAllCause(
        Effect.gen(function* () {
          const service = yield* EditorSyncService.Service;
          const ready = yield* Deferred.make<void>();
          yield* Effect.all(
            [
              Effect.scoped(service.setupDoc(doc, { noteId, isDaily }, ready)),
              Effect.gen(function* () {
                yield* Deferred.await(ready);
                yield* Effect.sync(() => setBootState(BootState.Ready()));
              }),
            ],
            { concurrency: "unbounded" },
          );
        }),
        (cause) =>
          Cause.isInterruptedOnly(cause)
            ? Effect.void
            : Effect.sync(() => {
                if (disposed) return;
                setBootState(
                  BootState.Error({ message: "Failed to load note content." }),
                );
              }),
      ),
    );

    onCleanup(() => {
      disposed = true;
      setBootState(BootState.Loading());
      void r.runPromise(Fiber.interrupt(fiber));
      doc.destroy();
    });
  });

  createEffect(() => {
    const editor = state()?.editor;
    if (!props.autoFocus || bootState()._tag !== "Ready" || !editor) return;

    const view = editor.view;
    view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)));
    view.focus();
  });

  return (
    <Show when={state()} keyed>
      {(current) => (
        <ProseKit editor={current.editor}>
          <MatchTagged value={bootState()} tag="Error">
            {(value) => (
              <p class="text-error-fg mb-3 text-sm">{value().message}</p>
            )}
          </MatchTagged>
          <div
            ref={current.editor.mount}
            class="outline-none"
            style={props.style}
            onFocusIn={() => props.onFocusIn?.()}
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
  const fragment = options.fragment ?? doc.getXmlFragment("prosemirror");

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
