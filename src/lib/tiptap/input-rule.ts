import { InputRule } from "@tiptap/core";
import type { Attrs } from "@tiptap/pm/model";
import { findWrapping } from "@tiptap/pm/transform";
import {
  getListType,
  isListNode,
  parseInteger,
  type ListAttributes,
} from "prosemirror-flat-list";

/**
 * A callback function to get the attributes for a list input rule.
 *
 * @public @group Input Rules
 */
export type ListInputRuleAttributesGetter<
  T extends ListAttributes = ListAttributes
> = (options: {
  /**
   * The match result of the regular expression.
   */
  match: RegExpMatchArray;

  /**
   * The previous attributes of the existing list node, if it exists.
   */
  attributes?: T;
}) => T;

/**
 * Copied from https://github.com/ocavue/prosemirror-flat-list/blob/a9fd037ff7471a09d88a59f4289c000dd7d959a6/packages/core/src/input-rule.ts
 */
export function wrappingListInputRule<
  T extends ListAttributes = ListAttributes
>(regexp: RegExp, getAttrs: T | ListInputRuleAttributesGetter<T>): InputRule {
  return new InputRule({
    find: regexp,
    // TODO: original code returned transaction, but tiptaps InputRule doesn't allow that
    handler: (opts) => {
      const tr = opts.state.tr;
      tr.deleteRange(opts.range.from, opts.range.to);

      const $pos = tr.selection.$from;
      const listNode = $pos.index(-1) === 0 && $pos.node(-1);
      if (listNode && isListNode(listNode)) {
        const oldAttrs: Attrs = listNode.attrs as ListAttributes;
        const newAttrs: Attrs =
          typeof getAttrs === "function"
            ? getAttrs({ match: opts.match, attributes: oldAttrs as T })
            : getAttrs;

        const entries = Object.entries(newAttrs).filter(([key, value]) => {
          return oldAttrs[key] !== value;
        });
        if (entries.length === 0) {
          return null;
        } else {
          const pos = $pos.before(-1);
          for (const [key, value] of entries) {
            tr.setNodeAttribute(pos, key, value);
          }
          return undefined;
        }
      }

      const $start = tr.doc.resolve(opts.range.from);
      const range = $start.blockRange();
      if (!range) {
        return null;
      }

      const newAttrs: Attrs =
        typeof getAttrs === "function"
          ? getAttrs({ match: opts.match })
          : getAttrs;
      const wrapping = findWrapping(
        range,
        getListType(opts.state.schema),
        newAttrs
      );
      if (!wrapping) {
        return null;
      }

      tr.wrap(range, wrapping);
      return undefined;
    },
  });
}

/**
 * This list does not include rules for the toggle list ">>", because the "bullet" list is collapsable.
 */
export const listInputRules: InputRule[] = [
  wrappingListInputRule<ListAttributes>(/^\s?([*-])\s$/, {
    kind: "bullet",
    collapsed: false,
  }),
  wrappingListInputRule<ListAttributes>(/^\s?(\d+)\.\s$/, ({ match }) => {
    const order = parseInteger(match[1]);
    return {
      kind: "ordered",
      collapsed: false,
      order: order != null && order >= 2 ? order : null,
    };
  }),
  wrappingListInputRule<ListAttributes>(/^\s?\[([\sXx]?)]\s$/, ({ match }) => {
    return {
      kind: "task",
      checked: ["x", "X"].includes(match[1]),
      collapsed: false,
    };
  }),
];
