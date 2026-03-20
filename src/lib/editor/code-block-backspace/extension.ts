import { defineKeymap, type PlainExtension } from "prosekit/core";
import type { Command } from "prosekit/pm/state";

/**
 * When Backspace is pressed at the start of an empty code block,
 * convert it to a paragraph so the user can delete/escape from it.
 */
export function defineCodeBlockBackspace(): PlainExtension {
  return defineKeymap({
    Backspace: codeBlockBackspace,
  });
}

const codeBlockBackspace: Command = (state, dispatch) => {
  const { selection } = state;
  if (!selection.empty) return false;

  const { $head } = selection;
  const parent = $head.parent;

  // Only handle code blocks with cursor at the very start
  if (!parent.type.spec.code || $head.parentOffset !== 0) return false;

  // Only handle empty code blocks
  if (parent.content.size !== 0) return false;

  const paragraphType = state.schema.nodes.paragraph;
  if (!paragraphType) return false;

  if (dispatch) {
    const pos = $head.before();
    const tr = state.tr.setNodeMarkup(pos, paragraphType);
    dispatch(tr);
  }

  return true;
};
