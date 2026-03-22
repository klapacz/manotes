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
import { Fiber, Effect, Deferred } from "effect";
import BacklinkMenu from "./lib/editor/backlink/menu";

type Props = EditorSyncService.SetupInput & {
  onFocusIn?: () => void;
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
          initial: props.initial,
        };
      },
      // Build the first editor state immediately so render/effect can consume it
      // on initial mount without waiting for the first dependency change.
      { defer: false },
    ),
  );

  const [docReady, setDocReady] = createSignal(false);

  createEffect(() => {
    setDocReady(false);
    const r = runtime();
    const { doc, noteId, isDaily, initial } = state();

    const fiber = r.runFork(
      Effect.gen(function* () {
        const service = yield* EditorSyncService.Service;
        const ready = yield* Deferred.make<void>();
        yield* Effect.all(
          [
            service.setupDoc(doc, { noteId, isDaily, initial }, ready),
            Effect.gen(function* () {
              yield* Deferred.await(ready);
              yield* Effect.sync(() => setDocReady(true));
            }),
          ],
          { concurrency: "unbounded" },
        );
      }),
    );

    onCleanup(() => {
      void r.runPromise(Fiber.interrupt(fiber));
      doc.destroy();
    });
  });

  createEffect(() => {
    const editor = state()?.editor;
    if (!props.autoFocus || !docReady() || !editor) return;

    const view = editor.view;
    view.dispatch(view.state.tr.setSelection(Selection.atEnd(view.state.doc)));
    view.focus();
  });

  return (
    <Show when={state()} keyed>
      {(current) => (
        <ProseKit editor={current.editor}>
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
