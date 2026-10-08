import { defineBaseCommands, defineBaseKeymap, defineKeymap, union } from "prosekit/core";
import { createMoveListCommand } from "prosemirror-flat-list";
import { defineGapCursor } from "prosekit/extensions/gap-cursor";
import { defineVirtualSelection } from "prosekit/extensions/virtual-selection";
import { defineModClickPrevention } from "prosekit/extensions/mod-click-prevention";
import { defineTaskListToggle } from "./editor.task-list-toggle.extension";
import { defineCodeBlockBackspace } from "./lib/editor/code-block-backspace/extension";
import { defineBacklinkCommands } from "./lib/editor/backlink/spec";
import { defineBacklinkRuntime } from "./lib/editor/backlink/extension";
import { defineStreamRefCommands } from "./lib/editor/stream-ref/spec";
import { defineStreamRefRuntime } from "./lib/editor/stream-ref/extension";
import { defineAppListExtension } from "./lib/editor/list/extension";
import { EditorLink } from "./lib/editor/link/extension";
import { defineAppTableExtension } from "./lib/editor/table/spec";
import { defineAppSchema } from "./editor.schema";

/**
 * Full editor extension for the browser.
 * Combines the schema with keymaps, commands, plugins, and Solid node views.
 * For workers, use {@link defineAppSchema} instead.
 */
export function defineAppExtension() {
  return union(
    defineAppSchema(),
    // Commands
    defineBaseCommands(),
    defineBacklinkCommands(),
    defineStreamRefCommands(),
    // Keymaps & plugins
    defineAppListExtension(),
    defineAppTableExtension(),
    defineBaseKeymap(),
    defineGapCursor(),
    defineVirtualSelection(),
    defineModClickPrevention(),
    EditorLink.define(),
    defineTaskListToggle(),
    // Using createMoveListCommand directly because defineKeymap needs raw
    // ProseMirror commands, and prosekit doesn't re-export this from flat-list.
    defineKeymap({
      "Alt-ArrowUp": createMoveListCommand("up"),
      "Alt-ArrowDown": createMoveListCommand("down"),
    }),
    defineCodeBlockBackspace(),
    // Browser runtime (node views, clipboard)
    defineBacklinkRuntime(),
    defineStreamRefRuntime(),
  );
}

export type AppExtension = ReturnType<typeof defineAppExtension>;
