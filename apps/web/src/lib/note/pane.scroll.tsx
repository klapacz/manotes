import { keyArray } from "@solid-primitives/keyed";
import { createListTransition, type OnListChange } from "@solid-primitives/transition-group";
import {
  For,
  createContext,
  onMount,
  useContext,
  type Accessor,
  type JSX,
  type Ref,
} from "solid-js";
import { PaneCursor } from "./pane.cursor";
import type { PaneSchema } from "./pane.schema";
import { Array as Arr, pipe, Option, Number } from "effect";
import { DOMScroll } from "../dom-scroll";
import { animate } from "motion";
import { Focus } from "../../components/note/focus";
import { PaneGrid } from "../../components/note/pane";

type Props = {
  panes: Accessor<PaneCursor.Stack>;
  children: (
    pane: Accessor<PaneSchema.Pane>,
    index: Accessor<number>,
    ref: Ref<HTMLElement | undefined>,
  ) => JSX.Element;
};

type Ctx = {
  scrollToPane: (input: PaneSchema.PaneInput) => { done: Promise<void>; found: boolean };
};

const Context = createContext<Ctx>();

type Item = {
  value: Accessor<PaneSchema.Pane>;
  index: Accessor<number>;
  ref: HTMLElement | undefined;
};

export function Root(props: Props): JSX.Element {
  const focus = Focus.use();

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

      const previousSingleNote = singlePreviousNoteTarget(prev, next);

      if (previousSingleNote) return void fadeRemovedAndScrollTo(previousSingleNote);

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

  function prepareScrollTransition(opts: Parameters<OnListChange<Item>>[0]) {
    const finish = () => opts.finishRemoved(opts.removed);

    // The list also keeps panes still exiting from an earlier transition, e.g.
    // when closing twice quickly. They belong to neither stack.
    const prev = opts.list.filter(
      (item) => opts.unchanged.includes(item) || opts.removed.includes(item),
    );

    const next = opts.list.filter(
      (item) => opts.unchanged.includes(item) || opts.added.includes(item),
    );

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

        return animate(
          target.ref,
          { opacity: 0, filter: "blur(2px)" },
          { duration: 0.16, ease: "easeOut" },
        );
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

  async function scrollTo(item: Item, behavior?: ScrollBehavior) {
    // Focus may wait for the pane to load or be superseded; scrolling must not.
    focus.request(Focus.id(item.value().paneId).pane());

    if (item.ref) await DOMScroll.center(item.ref, behavior);
  }

  onMount(() => {
    const last = rendered()?.at(-1);

    if (last) void scrollTo(last, "instant");
  });

  function move(delta: number) {
    const focusedPane = focus.targetId();
    const actual = current();

    const index = pipe(
      Arr.findFirstIndex(actual, (value) => value.value().paneId === focusedPane?.paneId),
      Option.getOrElse(() => 0),
      (idx) => idx + delta,
      Number.clamp({
        minimum: 0,
        maximum: actual.length - 1,
      }),
    );

    const pane = actual[index];

    if (!pane) return false;

    void scrollTo(pane);

    return true;
  }

  const fnode = Focus.createNode(() => ({}));

  fnode.registerShortcuts([
    {
      key: [["L"], ["ArrowRight"]],
      allowRepeat: true,
      handler: () => move(1),
    },
    {
      key: [["H"], ["ArrowLeft"]],
      allowRepeat: true,
      handler: () => move(-1),
    },
  ]);

  return (
    <Focus.NodeProvider node={fnode}>
      <Context.Provider value={{ scrollToPane }}>
        <Focus.Element as={PaneGrid}>
          <For each={rendered()}>
            {(item) => props.children(item.value, item.index, (el) => (item.ref = el))}
          </For>
        </Focus.Element>
      </Context.Provider>
    </Focus.NodeProvider>
  );
}

export function use(): Ctx {
  const ctx = useContext(Context);

  if (!ctx) throw new Error("PaneScroll.use must be used inside PaneScroll.Root");

  return ctx;
}

function singlePreviousNoteTarget(prev: Item[], next: Arr.NonEmptyArray<Item>): Item | undefined {
  if (prev.length === 1 || next.length !== 1) return;

  const target = Arr.headNonEmpty(next);
  const existed = Arr.findFirst(prev, (item) => item === target);

  return Option.isSome(existed) ? target : undefined;
}

function resolveMicrotask() {
  return new Promise<void>((resolve) => queueMicrotask(resolve));
}

export * as PaneScroll from "./pane.scroll";
