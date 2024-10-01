import "remirror/styles/all.css";

import { useCallback } from "react";
import { ExtensionPriority } from "remirror";
import {
  BlockquoteExtension,
  BoldExtension,
  BulletListExtension,
  CodeExtension,
  HardBreakExtension,
  HeadingExtension,
  ItalicExtension,
  LinkExtension,
  ListItemExtension,
  MarkdownExtension,
  OrderedListExtension,
  StrikeExtension,
  TaskListExtension,
  TrailingNodeExtension,
} from "remirror/extensions";
import {
  EditorComponent,
  Remirror,
  ThemeProvider,
  useRemirror,
} from "@remirror/react";
import { ToggleListItemExtension } from "./toggleable";

/**
 * The editor which is used to create the annotation. Supports formatting.
 */
export function Editor() {
  const extensions = useCallback(
    () => [
      new LinkExtension({ autoLink: true }),
      // new PlaceholderExtension({ placeholder }),
      new BoldExtension({}),
      new StrikeExtension(),
      new ItalicExtension(),
      new HeadingExtension({}),
      new BlockquoteExtension(),

      new BulletListExtension({ enableSpine: true }),
      new OrderedListExtension(),
      new ListItemExtension({
        priority: ExtensionPriority.High,
        enableCollapsible: true,
      }),
      new TaskListExtension(),
      new ToggleListItemExtension(),

      new CodeExtension(),
      new TrailingNodeExtension({}),
      new MarkdownExtension({ copyAsMarkdown: false }),
      /**
       * `HardBreakExtension` allows us to create a newline inside paragraphs.
       * e.g. in a list item
       */
      new HardBreakExtension(),
    ],
    []
  );

  const { manager } = useRemirror({
    extensions,
    stringHandler: "markdown",
  });

  return (
    <ThemeProvider>
      <Remirror manager={manager} autoFocus>
        <EditorComponent />
      </Remirror>
    </ThemeProvider>
  );
}
