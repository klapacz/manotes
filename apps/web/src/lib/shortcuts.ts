import { createSequenceMatcher, isModifierKey, type Hotkey } from "@tanstack/hotkeys";
import { onCleanup } from "solid-js";

export interface Binding {
  readonly key: ReadonlyArray<ReadonlyArray<Hotkey>>;
  readonly enabled?: () => boolean;
  readonly handler: (event: KeyboardEvent) => boolean | undefined | void;
  readonly allowRepeat?: boolean;
}

/** Bindings belong to the component that owns the action; this only matches keys. */
export function create() {
  const handlers = new Set<(event: KeyboardEvent) => boolean>();

  const register = (bindings: ReadonlyArray<Binding>) => {
    const matchers = bindings.map((binding) => ({
      ...binding,
      sequences: binding.key.map((keys) => createSequenceMatcher([...keys])),
    }));

    const handle = (event: KeyboardEvent) => {
      for (const binding of matchers) {
        if ((!binding.allowRepeat && event.repeat) || binding.enabled?.() === false) continue;

        if (!binding.sequences.some((matcher) => matcher.match(event))) continue;

        if (binding.handler(event) !== true) continue;

        event.preventDefault();

        return true;
      }

      return false;
    };

    handlers.add(handle);
    onCleanup(() => handlers.delete(handle));
  };

  const handle = (event: KeyboardEvent) => {
    if (isModifierKey(event.key)) return false;

    for (const handler of handlers) if (handler(event)) return true;

    return false;
  };

  return { register, handle };
}

/** Whether the focused control uses this key itself; scope shortcuts get the rest. */
export function controlOwnsKey(target: EventTarget | null, event: KeyboardEvent): boolean {
  if (!(target instanceof Element)) return false;

  // Text entry and dialogs use every key.
  if (target.closest("input, select, textarea, [role='dialog'], [contenteditable='true']")) {
    return true;
  }

  // Links activate with Enter, including modified Enter for new tabs.
  if (target.closest("a[href]")) return event.key === "Enter";

  // Buttons activate with plain Enter/Space; Mod+Enter stays a shortcut.
  if (target.closest("button, [role='button']")) {
    const plain = !event.metaKey && !event.ctrlKey && !event.altKey;

    return plain && (event.key === "Enter" || event.key === " ");
  }

  return false;
}

export * as Shortcuts from "./shortcuts";
