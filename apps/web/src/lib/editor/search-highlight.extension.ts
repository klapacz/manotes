import { definePlugin, type PlainExtension } from "prosekit/core";
import { Schema } from "effect";
import type { Node } from "prosekit/pm/model";
import { Plugin, PluginKey } from "prosekit/pm/state";
import { Decoration, DecorationSet, type EditorView } from "prosekit/pm/view";
import { decodeBacklinkAttrs } from "@manotes/shared/editor/backlink/spec";

type State = { query: string; backlinksTo?: string; decorations: DecorationSet };

const key = new PluginKey<State>("manotes-search-highlight");

const decodeFilter = Schema.decodeUnknownSync(
  Schema.UndefinedOr(
    Schema.Struct({ query: Schema.String, backlinksTo: Schema.optional(Schema.String) }),
  ),
);

export function defineSearchHighlight(): PlainExtension {
  return definePlugin(
    new Plugin<State>({
      key,
      state: {
        init: () => ({ query: "", decorations: DecorationSet.empty }),
        apply: (transaction, previous) => {
          const { query, backlinksTo } = decodeFilter(transaction.getMeta(key)) ?? previous;

          if (
            !transaction.docChanged &&
            query === previous.query &&
            backlinksTo === previous.backlinksTo
          ) {
            return previous;
          }

          return {
            query,
            backlinksTo,
            decorations: highlight(transaction.doc, query, backlinksTo),
          };
        },
      },
      props: {
        decorations: (state) => key.getState(state)?.decorations ?? DecorationSet.empty,
      },
    }),
  );
}

export function setSearchHighlight(view: EditorView, search: string, backlinksTo?: string): void {
  const query = foldCase(search.trim());
  const previous = key.getState(view.state);

  if (previous?.query === query && previous.backlinksTo === backlinksTo) return;

  view.dispatch(view.state.tr.setMeta(key, { query, backlinksTo }).setMeta("addToHistory", false));
}

function highlight(doc: Node, query: string, backlinksTo?: string): DecorationSet {
  if (!query && !backlinksTo) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  doc.descendants((node, position) => {
    if (node.type.name === "backlink") {
      if (backlinksTo && decodeBacklinkAttrs(node.attrs).id === backlinksTo) {
        decorations.push(
          Decoration.node(position, position + node.nodeSize, { class: "search-highlight" }),
        );
      }

      return false;
    }

    if (!query || !node.isTextblock) return;

    // Flatten formatting boundaries while keeping inline atoms one position wide.
    const text = foldCase(node.textBetween(0, node.content.size, "", "\uFFFC"));

    for (let at = text.indexOf(query); at !== -1; at = text.indexOf(query, at + 1)) {
      const from = position + 1 + at;

      decorations.push(Decoration.inline(from, from + query.length, { class: "search-highlight" }));
    }

    // Continue into the textblock to decorate matching backlink atoms as well.
  });

  return DecorationSet.create(doc, decorations);
}

// Match SQLite LIKE's ASCII case folding without changing text offsets.
function foldCase(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}
