import "prosekit/basic/style.css";
import "prosekit/basic/typography.css";

import { createEditor, Priority, union, withPriority } from "prosekit/core";
import { ProseKit } from "prosekit/solid";
import {
  createEffect,
  createMemo,
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
import { useRuntime, type NoteSchema, EditorSyncService } from "./lib";
import { Fiber, Effect } from "effect";

export default function Editor(props: {
  note: typeof NoteSchema.Record.Type;
}): JSX.Element {
  const runtime = useRuntime();

  // The editor stack is recreated per note-id boundary so future route/view
  // changes can swap notes in-place without leaking Y.Doc/editor state.
  const state = createMemo(
    on(
      () => props.note.id,
      (noteId) => {
        const doc = new Y.Doc();
        const extension = union([defineYjs({ doc }), defineAppExtension()]);
        const editor = createEditor({ extension });

        return {
          doc,
          editor,
          initialNote: { ...props.note, id: noteId },
        };
      },
      // Build the first editor state immediately so render/effect can consume it
      // on initial mount without waiting for the first dependency change.
      { defer: false },
    ),
  );

  createEffect(() => {
    const r = runtime();
    const { doc, initialNote } = state();

    const fiber = r.runFork(
      Effect.gen(function* () {
        const service = yield* EditorSyncService.Service;
        yield* service.setupDoc(doc, initialNote);
      }),
    );

    onCleanup(() => {
      void r.runPromise(Fiber.interrupt(fiber));
      doc.destroy();
    });
  });

  return (
    <Show when={state()} keyed>
      {(current) => (
        <ProseKit editor={current.editor}>
          <div ref={current.editor.mount} class="outline-solid p-4"></div>
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
