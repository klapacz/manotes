import { Match } from "effect";
import type { Editor } from "prosekit/core";
import { onCleanup, onMount } from "solid-js";
import type { AppExtension } from "../../editor.extension";

// The listbox navigates on ArrowDown/ArrowUp keydown events forwarded through
// ProseMirror. Alias Ctrl-N / Ctrl-P to those keys while the popover is open.
export function useArrowKeyAliases(editor: () => Editor<AppExtension>, isOpen: () => boolean) {
  onMount(() => {
    const dom = editor().view.dom;

    const handler = (event: KeyboardEvent) => {
      if (!isOpen() || !event.ctrlKey || event.metaKey || event.altKey) return;
      const key = event.key.toLowerCase();

      const aliased = Match.value(key).pipe(
        Match.when("n", () => "ArrowDown"),
        Match.when("p", () => "ArrowUp"),
        Match.orElse(() => null),
      );

      if (!aliased) return;
      event.preventDefault();
      dom.dispatchEvent(
        new KeyboardEvent("keydown", { key: aliased, bubbles: true, cancelable: true }),
      );
    };

    dom.addEventListener("keydown", handler, { capture: true });
    onCleanup(() => dom.removeEventListener("keydown", handler, { capture: true }));
  });
}
