import { definePlugin, type PlainExtension } from "prosekit/core";
import { Plugin, PluginKey } from "prosekit/pm/state";
import { Decoration, DecorationSet } from "prosekit/pm/view";

type Options = {
  title: string;
};

export function defineVirtualDailyHeading(options: Options): PlainExtension {
  return definePlugin(createVirtualDailyHeadingPlugin(options));
}

function createVirtualDailyHeadingPlugin({ title }: Options): Plugin {
  return new Plugin({
    key: new PluginKey("manotes-virtual-daily-heading"),
    props: {
      decorations: (state) => {
        if (!title) return null;

        // Widget decorations are view-only, so this heading is never persisted
        // into the Yjs/ProseMirror document.
        const heading = Decoration.widget(
          // Position at the start of the document.
          0,
          () => {
            const element = document.createElement("h1");
            element.className = "virtual-daily-heading";
            element.setAttribute("contenteditable", "false");
            element.textContent = title;

            return element;
          },
          {
            // Render before content at this position to keep heading first.
            side: -1,
            ignoreSelection: true,
          },
        );

        return DecorationSet.create(state.doc, [heading]);
      },
    },
  });
}
