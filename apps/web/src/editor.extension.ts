import { defineBaseCommands, defineBaseKeymap, defineKeymap, union } from "prosekit/core";
import { createMoveListCommand } from "prosemirror-flat-list";
import { defineGapCursor } from "prosekit/extensions/gap-cursor";
import { defineVirtualSelection } from "prosekit/extensions/virtual-selection";
import { defineModClickPrevention } from "prosekit/extensions/mod-click-prevention";
import { defineTaskListToggle } from "./editor.task-list-toggle.extension";
import { defineCodeBlockBackspace } from "./lib/editor/code-block-backspace/extension";
import { defineBacklinkCommands } from "./lib/editor/backlink/spec";
import { defineBacklinkRuntime } from "./lib/editor/backlink/extension";
import { defineAppListExtension } from "./lib/editor/list/extension";
import { defineAppSchema, type DefineAppSchemaOptions } from "./editor.schema";
import { defineTitlePlaceholder } from "./lib/editor/title-placeholder/extension";

/**
 * Full editor extension for the browser.
 * Combines the schema with keymaps, commands, plugins, and Solid node views.
 * For workers, use {@link defineAppSchema} instead.
 */
export function defineAppExtension(options: DefineAppSchemaOptions) {
  return union(
    defineAppSchema(options),
    // Commands
    defineBaseCommands(),
    defineBacklinkCommands(),
    // Keymaps & plugins
    defineAppListExtension(),
    defineBaseKeymap(),
    defineGapCursor(),
    defineVirtualSelection(),
    defineModClickPrevention(),
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
    // Title placeholder for non-daily notes
    ...(!options.isDaily ? [defineTitlePlaceholder()] : []),
  );
}

export type AppExtension = ReturnType<typeof defineAppExtension>;
