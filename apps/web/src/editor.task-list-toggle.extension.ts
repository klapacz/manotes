import { defineKeymap, type PlainExtension } from "prosekit/core";
import type { Command } from "prosekit/pm/state";

export function defineTaskListToggle(): PlainExtension {
  return defineKeymap({
    "Mod-Enter": createToggleTaskListItemCommand(),
  });
}

function createToggleTaskListItemCommand(): Command {
  return (state, dispatch) => {
    const { selection } = state;
    const { $from } = selection;

    for (let depth = $from.depth; depth >= 0; depth -= 1) {
      const node = $from.node(depth);
      if (node.type.name !== "list" || node.attrs.kind !== "task") {
        continue;
      }

      const listPos = $from.before(depth);
      const tr = state.tr.setNodeMarkup(listPos, null, {
        ...node.attrs,
        checked: !node.attrs.checked,
      });
      dispatch?.(tr);
      return true;
    }

    return false;
  };
}
