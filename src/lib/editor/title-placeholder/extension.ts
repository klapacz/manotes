import { definePlugin, type PlainExtension } from "prosekit/core";
import { Plugin, PluginKey } from "prosekit/pm/state";
import { Decoration, DecorationSet } from "prosekit/pm/view";

export function defineTitlePlaceholder(): PlainExtension {
  return definePlugin(
    new Plugin({
      key: new PluginKey("manotes-title-placeholder"),
      props: {
        decorations: (state) => {
          const firstChild = state.doc.firstChild;
          if (!firstChild || firstChild.type.name !== "heading") return null;
          if (firstChild.content.size > 0) return null;

          const deco = Decoration.node(0, firstChild.nodeSize, {
            class: "prosekit-placeholder",
            "data-placeholder": "Untitled",
          });
          return DecorationSet.create(state.doc, [deco]);
        },
      },
    }),
  );
}
