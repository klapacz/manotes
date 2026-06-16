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

  async function scrollTo(item: Item) {
    focus.focusNode(Focus.id(item.value().paneId).pane());
    if (!item.ref) return;
    if (DOMScroll.isCenteredInScrollParent(item.ref)) return;

    await DOMScroll.waitForScroll(item.ref);
  }

  onMount(() => {
    const last = rendered()?.at(-1);
    if (!last) return;

    last.ref?.scrollIntoView({
      block: "nearest",
      inline: "center",
    });

    focus.focusWhenAvailable(Focus.id(last.value().paneId).pane());
  });

  function move(ctx: Focus.ContextValue, delta: number) {
    const focusedPane = ctx.focusedStack().find((e) => e._tag === "PaneFocusId");
    const actual = rendered();
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

    focus.focusWhenAvailable(Focus.id(pane.value().paneId).pane());
    return true;
  }

  const fnode = Focus.createNode((ctx) => ({
    id: new Focus.PaneGridFocusId(),
    onKeyDown(event) {
      if (event.key === "l" || event.key === "ArrowRight") {
        return move(ctx, 1);
      } else if (event.key === "h" || event.key === "ArrowLeft") {
        return move(ctx, -1);
      }
    },
  }));

  return (
    <Focus.NodeProvider node={fnode}>
      <Context.Provider value={{ scrollToPane }}>
        <For each={rendered()}>
          {(item) => props.children(item.value, item.index, (el) => (item.ref = el))}
        </For>
      </Context.Provider>
    </Focus.NodeProvider>
  );
}

export function use(): Ctx {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("PaneScroll.use must be used inside PaneScroll.Root");
  return ctx;
}

function resolveMicrotask() {
  return new Promise<void>((resolve) => queueMicrotask(resolve));
}

export * as PaneScroll from "./pane.scroll";
