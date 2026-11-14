import { makePersisted } from "@solid-primitives/storage";
import { makeEventListener } from "@solid-primitives/event-listener";
import { Schema } from "effect";
import { createEffect, createMemo, createSignal, onCleanup, type Accessor } from "solid-js";

/**
 * Each graph's primary color lives in localStorage and syncs across this browser's tabs.
 * Colors never sync between devices.
 * The graph context calls use() and exposes the persisted signal to the menu.
 * makePersisted restores and saves it under the graph's localGraphId.
 * use() restores the signal on graph changes, applies colors, and clears overrides on exit.
 * apply() maps --primary-1 through --primary-12 to the selected Radix scale.
 * colors.css keeps every scale available with @theme static, including dark variants.
 * styles.css uses these variables for primary tokens, with green CSS fallbacks
 * before JavaScript runs. JavaScript only restores or changes the saved preference.
 */
export const Color = Schema.Literals([
  "bronze",
  "gold",
  "brown",
  "orange",
  "tomato",
  "red",
  "ruby",
  "crimson",
  "pink",
  "plum",
  "purple",
  "violet",
  "iris",
  "indigo",
  "blue",
  "cyan",
  "teal",
  "jade",
  "green",
  "grass",
]);

export type Color = Schema.Schema.Type<typeof Color>;

export const colors = Color.literals;

const decodeColor = Schema.decodeUnknownSync(Color);

const encodeColor = Schema.encodeSync(Color);

export type State = ReturnType<typeof create>;

export function use(localGraphId: Accessor<string>) {
  const state = createMemo(() => create(localGraphId()));
  createEffect(() => apply(state().color()));
  onCleanup(clear);

  return state;
}

export function create(localGraphId: string) {
  const [color, setColor] = makePersisted(createSignal<Color>("green"), {
    name: `manotes:primary-color:${localGraphId}`,
    serialize: encodeColor,
    deserialize: decodeColor,
    // storageSync filters by full URL and never detaches; graph views need scoped, URL-independent updates.
    sync: [
      (subscribe) => {
        return makeEventListener(window, "storage", (event) => {
          if (event.storageArea !== localStorage || event.key === null) return;

          subscribe({ key: event.key, newValue: event.newValue, timeStamp: event.timeStamp });
        });
      },
      () => {
        // localStorage already sends storage events to the other tabs.
      },
    ],
  });

  return {
    color,
    setColor(value: string) {
      setColor(decodeColor(value));
    },
  };
}

export function apply(color: Color) {
  for (let step = 1; step <= 12; step++) {
    document.documentElement.style.setProperty(
      `--primary-${step}`,
      `var(--color-${color}-${step})`,
    );
  }
}

export function clear() {
  for (let step = 1; step <= 12; step++) {
    document.documentElement.style.removeProperty(`--primary-${step}`);
  }
}

export * as PrimaryColor from "./primary-color";
