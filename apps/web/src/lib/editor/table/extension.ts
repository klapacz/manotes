import { defineKeymap, Priority, union, withPriority } from "prosekit/core";
import {
  defineTableEditingPlugin,
  defineTableDropIndicator,
  deleteTable,
  isCellSelection,
} from "prosekit/extensions/table";
import type { Command } from "prosekit/pm/state";
import { defineAppTableExtension } from "@manotes/shared/editor/table/spec";

export function defineTableExtension() {
  return union(
    defineAppTableExtension(),
    defineTableEditingPlugin({ allowTableNodeSelection: true }),
    defineTableDropIndicator(),
    withPriority(
      defineKeymap({ Backspace: deleteSelectedTable, Delete: deleteSelectedTable }),
      Priority.high,
    ),
  );
}

const deleteSelectedTable: Command = (state, dispatch) => {
  const { selection } = state;

  if (!isCellSelection(selection) || !selection.isRowSelection() || !selection.isColSelection())
    return false;

  return deleteTable(state, dispatch);
};
