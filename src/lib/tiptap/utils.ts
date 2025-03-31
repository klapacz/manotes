import type { CommandProps } from "@tiptap/core";
import type { EditorState, Transaction } from "@tiptap/pm/state";
import type { EditorView } from "@tiptap/pm/view";

export type ProsemirrorCommandFunction = (
  state: EditorState,
  dispatch: DispatchFunction | undefined,
  view: EditorView | undefined,
) => boolean;

/**
 * Used to apply the Prosemirror transaction to the current {@link EditorState}.
 *
 * @typeParam Schema - the underlying editor schema.
 */
export type DispatchFunction = (tr: Transaction) => void;

/**
 * Copied from https://github.com/remirror/remirror/blob/b3c8b02f7562afb7de08b4308a3302a500386d33/packages/remirror__pm/src/extra/pm-utils.ts#L71
 *
 * TODO: the original function was using the chainableEditorState - I should take a look at this.
 */
export function convertCommand(
  commandFunction: ProsemirrorCommandFunction,
): TiptapCommand {
  return ({ state, dispatch, view }) => commandFunction(state, dispatch, view);
}

type TiptapCommand = (props: CommandProps) => boolean;
