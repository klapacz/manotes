import { Schema } from "effect";
import { defineKeymap, definePlugin, Priority, union, withPriority } from "prosekit/core";
import { Plugin, PluginKey, TextSelection } from "prosekit/pm/state";
import type { EditorView } from "prosekit/pm/view";
import { ySyncPluginKey } from "y-prosemirror";

// Views whose caret the user has placed; a fresh view's caret is just doc start.
const entered = new WeakSet<EditorView>();

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
          handleDOMEvents: {
            focus: (view) => {
              entered.add(view);

              return false;
            },
          },
        },
      }),
    ),
    withPriority(
      defineKeymap({
        Escape: (_state, _dispatch, view) => {
          if (!view || view.composing || !view.hasFocus()) return false;

          return onLeave();
        },
      }),
      Priority.lowest,
    ),
  );
}

/**
 * Edit where the reader is looking: keep a visible caret the user placed,
 * otherwise move it to the end of the last visible textblock. Never jumps.
 * Call before `view.focus()`, which marks the view as entered.
 */
export function placeCaretInView(view: EditorView) {
  const visible = visibleRect(view.dom);

  if (!visible) return;

  const head = view.coordsAtPos(view.state.selection.head);

  if (entered.has(view) && isInside(head, visible)) return;

  let target: number | undefined;
  let below = false;

  view.state.doc.descendants((node, pos) => {
    if (below) return false;

    if (!node.isTextblock) return true;

    const end = pos + node.nodeSize - 1;
    const coords = view.coordsAtPos(end);

    if (coords.top >= visible.bottom) below = true;
    else if (isInside(coords, visible)) target = end;

    return false;
  });

  // A textblock taller than the viewport shows no end; use its last visible line.
  target ??= view.posAtCoords({ left: visible.right - 1, top: visible.bottom - 1 })?.pos;

  if (target !== undefined) {
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, target)));
  }
}

type Rect = { top: number; bottom: number; left: number; right: number };

// Vertical extent of `element` not clipped by its scrollers or the window.
function visibleRect(element: HTMLElement): Rect | undefined {
  const own = element.getBoundingClientRect();
  let top = Math.max(own.top, 0);
  let bottom = Math.min(own.bottom, window.innerHeight);

  for (let node = element.parentElement; node; node = node.parentElement) {
    if (!/(auto|scroll|overlay|hidden)/.test(getComputedStyle(node).overflowY)) continue;

    const rect = node.getBoundingClientRect();

    top = Math.max(top, rect.top);
    bottom = Math.min(bottom, rect.bottom);
  }

  return top < bottom ? { top, bottom, left: own.left, right: own.right } : undefined;
}

function isInside(coords: { top: number; bottom: number }, rect: Rect) {
  return coords.top >= rect.top && coords.bottom <= rect.bottom;
}

const isYjsOrigin = Schema.is(
  Schema.Struct({
    isChangeOrigin: Schema.Boolean,
    isUndoRedoOperation: Schema.optional(Schema.Boolean),
  }),
);

export * as EditorFocus from "./focus.extension";
