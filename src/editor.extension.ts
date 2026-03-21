import { defineBaseCommands, defineBaseKeymap, union } from "prosekit/core";
import { defineGapCursor } from "prosekit/extensions/gap-cursor";
import { defineVirtualSelection } from "prosekit/extensions/virtual-selection";
import { defineModClickPrevention } from "prosekit/extensions/mod-click-prevention";
import { defineTaskListToggle } from "./editor.task-list-toggle.extension";
import { defineCodeBlockBackspace } from "./lib/editor/code-block-backspace/extension";
import { defineBacklinkCommands } from "./lib/editor/backlink/spec";
import { defineBacklinkRuntime } from "./lib/editor/backlink/extension";
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
    defineBaseKeymap(),
    defineGapCursor(),
    defineVirtualSelection(),
    defineModClickPrevention(),
    defineTaskListToggle(),
    defineCodeBlockBackspace(),
    // Browser runtime (node views, clipboard)
    defineBacklinkRuntime(),
    // Title placeholder for non-daily notes
    ...(!options.isDaily ? [defineTitlePlaceholder()] : []),
  );
}

export type AppExtension = ReturnType<typeof defineAppExtension>;
