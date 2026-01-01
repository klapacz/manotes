import "prosekit/basic/style.css";
import "prosekit/basic/typography.css";

import { createEditor, Priority, union, withPriority } from "prosekit/core";
import { ProseKit } from "prosekit/solid";
import { createEffect, onCleanup, type JSX } from "solid-js";
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
  const doc = new Y.Doc();

  const runtime = useRuntime();

  createEffect(() => {
    const r = runtime();

    const fiber = r.runFork(
      Effect.gen(function* () {
        const service = yield* EditorSyncService.Service;
        yield* service.setupDoc(doc, props.note.id);
      }),
    );

    onCleanup(() => void r.runPromise(Fiber.interrupt(fiber)));
  });

  const extension = union([defineYjs({ doc }), defineAppExtension()]);

  const editor = createEditor({ extension });

  return (
    <ProseKit editor={editor}>
      <div ref={editor.mount} class="outline-solid p-4"></div>
    </ProseKit>
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
