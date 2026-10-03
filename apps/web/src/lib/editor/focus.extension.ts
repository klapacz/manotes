import { Schema } from "effect";
import { defineKeymap, definePlugin, Priority, union, withPriority } from "prosekit/core";
import { Plugin, PluginKey } from "prosekit/pm/state";
import { ySyncPluginKey } from "y-prosemirror";

export function define(onLeave: () => boolean) {
  const key = new PluginKey<boolean>("manotes-local-caret-scroll");

  return union(
    definePlugin(
      new Plugin({
        key,
        state: {
          init: () => false,
          apply: (transaction, reveal) => {
            if (!transaction.scrolledIntoView) return reveal;
            const origin: unknown = transaction.getMeta(ySyncPluginKey);

            const remote =
              isYjsOrigin(origin) && origin.isChangeOrigin && !origin.isUndoRedoOperation;

            return transaction.getMeta("pointer") !== true && !remote;
          },
        },
        props: {
          // ProseMirror calls this only for a new scroll request. Keep its native
          // caret reveal for local commands; passive/pointer updates must not jump.
          handleScrollToSelection: (view) => !(key.getState(view.state) && view.hasFocus()),
        },
      }),
    ),
    withPriority(
      defineKeymap({
        Escape: (_state, _dispatch, view) => {
          if (!view || view.composing || !view.hasFocus()) return false;

          if (!onLeave()) return false;

          // Safari can resume typing at a retained DOM caret after focus leaves.
          // Keep ProseMirror's selection so view.focus() restores it on re-entry.
          const selection = view.dom.ownerDocument.getSelection();

          if (
            selection &&
            view.dom.contains(selection.anchorNode) &&
            view.dom.contains(selection.focusNode)
          ) {
            selection.removeAllRanges();
          }

          return true;
        },
      }),
      Priority.lowest,
    ),
  );
}

const isYjsOrigin = Schema.is(
  Schema.Struct({
    isChangeOrigin: Schema.Boolean,
    isUndoRedoOperation: Schema.optional(Schema.Boolean),
  }),
);

export * as EditorFocus from "./focus.extension";
