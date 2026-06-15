import { keyArray } from "@solid-primitives/keyed";
import { Ref } from "@solid-primitives/refs";
import { createListTransition } from "@solid-primitives/transition-group";
import { For, onCleanup, type Accessor, type JSX } from "solid-js";
import type { PaneCursor } from "./pane.cursor";
import type { PaneSchema } from "./pane.schema";
import { Array as Arr } from "effect";
import { DOMScroll } from "../dom-scroll";
import { animate } from "motion";

type Props = {
  panes: Accessor<PaneCursor.Stack>;
  children: (pane: Accessor<PaneSchema.Pane>, index: Accessor<number>) => JSX.Element;
};

export function Root(props: Props): JSX.Element {
  const current = keyArray(
    props.panes,
    (pane) => pane.paneId,
    (value, index) => ({
      value,
      index,
      ref: undefined as Element | undefined,
    }),
  );

  const rendered = createListTransition(current, {
    exitMethod: "keep-index",
    onChange: ({ list, added, removed, finishRemoved }) => {
      const finish = () => finishRemoved(removed);

      // Previously rendered stack, excluding panes added by this transition.
      const curr = list.filter((item) => !added.includes(item));
      // Next stack, excluding panes waiting for exit completion.
      const next = list.filter((item) => !removed.includes(item));
      // The pane we want centered after a continuous navigation change.
      const target = next.at(-1);

      // Shared leading panes: A B C -> A B D has prefix A B.
      const prefix = Arr.takeWhile(next, (item, i) => item === curr[i]);
      // Same stack; no navigation change to animate.
      const unchanged = curr.length === next.length && prefix.length === next.length;
      // Pure back navigation: A B C -> A B. Removed panes must stay until scroll ends.
      const isPop = prefix.length === next.length && curr.length > next.length;

      if (!target || !prefix.length || unchanged) return finish();

      if (isPop) {
        return void (async () => {
          await resolveMicrotask();

          const animations = removed.map((target) => {
            if (!(target.ref instanceof HTMLElement)) return;
            return animate(target.ref, { opacity: 0 });
          });

          await Promise.all([scrollTo(target), ...animations]);
          finish();
        })();
      }

      // Branch/forward navigation: A B C -> A B D. Remove old branch, then scroll to D.
      finish();
      void resolveMicrotask().then(() => scrollTo(target));
    },
  });

  return (
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
  );
}

async function scrollTo(item: { ref: Element | undefined }) {
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
