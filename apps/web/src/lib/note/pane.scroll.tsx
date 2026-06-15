import { keyArray } from "@solid-primitives/keyed";
import { Ref } from "@solid-primitives/refs";
import { createListTransition, type OnListChange } from "@solid-primitives/transition-group";
import { For, createContext, onCleanup, useContext, type Accessor, type JSX } from "solid-js";
import { PaneCursor } from "./pane.cursor";
import type { PaneSchema } from "./pane.schema";
import { Array as Arr, pipe, Option } from "effect";
import { DOMScroll } from "../dom-scroll";
import { animate } from "motion";

type Props = {
  panes: Accessor<PaneCursor.Stack>;
  children: (pane: Accessor<PaneSchema.Pane>, index: Accessor<number>) => JSX.Element;
};

type Ctx = {
  scrollToPane: (input: PaneSchema.PaneInput) => { done: Promise<void>; found: boolean };
};

const Context = createContext<Ctx>();

type Item = { value: Accessor<PaneSchema.Pane>; index: Accessor<number>; ref: undefined | Element };

export function Root(props: Props): JSX.Element {
  const current = keyArray(
    props.panes,
    (pane) => pane.paneId,
    (value, index): Item => ({ value, index, ref: undefined }),
  );

  const rendered = createListTransition(current, {
    exitMethod: "keep-index",
    onChange: (opts) => {
      const transition = prepareScrollTransition(opts);
      if (Option.isNone(transition)) return;

      const { prev, next, prefix, postfix, fadeRemovedAndScrollTo, removeImmediatelyAndScrollTo } =
        transition.value;

      if (prev.length > next.length) {
        // Pure back navigation: A B C -> A B. Removed panes must stay until scroll ends.
        if (prefix.length === next.length) {
          return void fadeRemovedAndScrollTo(Arr.lastNonEmpty(next));
        }

        // Pure back navigation from the front: A B C -> B C. Removed panes must stay until scroll ends.
        if (postfix.length === next.length) {
          return void fadeRemovedAndScrollTo(Arr.headNonEmpty(next));
        }
      }

      // Branch/forward navigation: A B C -> A B D. Remove old branch, then scroll to D.
      void removeImmediatelyAndScrollTo(Arr.lastNonEmpty(next));
    },
  });

  const scrollToPane = (input: PaneSchema.PaneInput) => {
    const filter = PaneCursor.inputMatches(input);

    // Check the canonical stack first; rendered panes can include exiting transition items.
    const inStack = props.panes().some(filter);
    if (!inStack) return { found: false, done: Promise.resolve() };

    const inUI = rendered().find((item) => filter(item.value()));
    if (!inUI) return { found: true, done: Promise.resolve() };

    return { found: true, done: scrollTo(inUI) };
  };

  return (
    <Context.Provider value={{ scrollToPane }}>
      <For each={rendered()}>
        {(item) => (
          <Ref
            ref={(el) => {
              item.ref = el;
              if (!el) return;

              const onFocusIn = () => void scrollTo(item);
              el.addEventListener("focusin", onFocusIn);
              onCleanup(() => el.removeEventListener("focusin", onFocusIn));
            }}
          >
            {props.children(item.value, item.index)}
          </Ref>
        )}
      </For>
    </Context.Provider>
  );
}

function prepareScrollTransition(opts: Parameters<OnListChange<Item>>[0]) {
  const finish = () => opts.finishRemoved(opts.removed);

  // Previously rendered stack, excluding panes added by this transition.
  const prev = opts.list.filter((item) => !opts.added.includes(item));
  // Next stack, excluding panes waiting for exit completion.
  const next = opts.list.filter((item) => !opts.removed.includes(item));

  // Shared leading panes: A B C -> A B D has prefix A B.
  const prefix = Arr.takeWhile(next, (item, i) => item === prev[i]);
  // Same stack; no navigation change to animate.
  const unchanged = prev.length === next.length && prefix.length === next.length;

  if (!Arr.isArrayNonEmpty(next) || unchanged) {
    finish();
    return Option.none();
  }

  // Shared trailing panes: A B C -> B C has postfix B C.
  const prevReversed = Arr.reverse(prev);
  const postfix = pipe(
    Arr.reverse(next),
    Arr.takeWhile((item, i) => item === prevReversed[i]),
  );

  async function fadeRemovedAndScrollTo(target: Item) {
    await resolveMicrotask();

    const animations = opts.removed.map((target) => {
      if (!(target.ref instanceof HTMLElement)) return;
      return animate(target.ref, { opacity: 0 });
    });

    await Promise.all([scrollTo(target), ...animations]);
    finish();
  }

  async function removeImmediatelyAndScrollTo(target: Item) {
    finish();
    await resolveMicrotask();
    await scrollTo(target);
  }

  return Option.some({
    next,
    prev,
    prefix,
    postfix,
    fadeRemovedAndScrollTo,
    removeImmediatelyAndScrollTo,
  });
}

export function use(): Ctx {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("PaneScroll.use must be used inside PaneScroll.Root");
  return ctx;
}

async function scrollTo(item: Item) {
  if (!(item.ref instanceof HTMLElement)) return;
  if (DOMScroll.isCenteredInScrollParent(item.ref)) return;

  await DOMScroll.scrollIntoViewAndWait(item.ref, {
    block: "nearest",
    inline: "center",
    behavior: "smooth",
  });
}

function resolveMicrotask() {
  return new Promise<void>((resolve) => queueMicrotask(resolve));
}

export * as PaneScroll from "./pane.scroll";
