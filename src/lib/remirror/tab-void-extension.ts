import { extension, type KeyBindings, PlainExtension } from "remirror";

/**
 * This extension is used to handle the Tab key press.
 * When the Tab key is pressed, it prevents navigation to the next selectable element on the page.
 * This extension should be added with the lowest priority.
 */
@extension({
  defaultOptions: {},
})
export class TabVoidExtension extends PlainExtension {
  get name() {
    return "tab" as const;
  }

  createKeymap(): KeyBindings {
    return {
      Tab: () => true,
      "Shift-Tab": () => true,
    };
  }
}
