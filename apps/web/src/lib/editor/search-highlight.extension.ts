import { definePlugin, type PlainExtension } from "prosekit/core";
import { Schema } from "effect";
import type { Node } from "prosekit/pm/model";
import { Plugin, PluginKey } from "prosekit/pm/state";
import { Decoration, DecorationSet, type EditorView } from "prosekit/pm/view";

type State = { query: string; decorations: DecorationSet };

const key = new PluginKey<State>("manotes-search-highlight");

const decodeQuery = Schema.decodeUnknownSync(Schema.UndefinedOr(Schema.String));

export function defineSearchHighlight(): PlainExtension {
  return definePlugin(
    new Plugin<State>({
      key,
      state: {
        init: () => ({ query: "", decorations: DecorationSet.empty }),
        apply: (transaction, previous) => {
          const query = decodeQuery(transaction.getMeta(key)) ?? previous.query;

          if (!transaction.docChanged && query === previous.query) return previous;

          return { query, decorations: highlight(transaction.doc, query) };
        },
      },
      props: {
        decorations: (state) => key.getState(state)?.decorations ?? DecorationSet.empty,
      },
    }),
  );
}

export function setSearchHighlight(view: EditorView, search: string): void {
  const query = foldCase(search.trim());

  if (key.getState(view.state)?.query === query) return;

  view.dispatch(view.state.tr.setMeta(key, query).setMeta("addToHistory", false));
}

function highlight(doc: Node, query: string): DecorationSet {
  if (!query) return DecorationSet.empty;

  const decorations: Decoration[] = [];

  doc.descendants((node, position) => {
    if (!node.isTextblock) return;

    // Flatten formatting boundaries while keeping inline atoms one position wide.
    const text = foldCase(node.textBetween(0, node.content.size, "", "\uFFFC"));

    for (let at = text.indexOf(query); at !== -1; at = text.indexOf(query, at + 1)) {
      const from = position + 1 + at;

      decorations.push(Decoration.inline(from, from + query.length, { class: "search-highlight" }));
    }

    return false;
  });

  return DecorationSet.create(doc, decorations);
}

// Match SQLite LIKE's ASCII case folding without changing text offsets.
function foldCase(text: string): string {
  return text.replace(/[A-Z]/g, (letter) => letter.toLowerCase());
}
