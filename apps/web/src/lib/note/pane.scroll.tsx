import { keyArray } from "@solid-primitives/keyed";
import { Ref } from "@solid-primitives/refs";
import { createListTransition } from "@solid-primitives/transition-group";
import { For, type Accessor, type JSX } from "solid-js";
import type { PaneCursor } from "./pane.cursor";
import type { PaneSchema } from "./pane.schema";
import { Array as Arr } from "effect";
import { DOMScroll } from "../dom-scroll";

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

  function scrollTo(item: { ref: Element | undefined }, done?: () => void) {
    queueMicrotask(() => {
      if (!(item.ref instanceof HTMLElement)) return done?.();
      if (DOMScroll.isCenteredInScrollParent(item.ref)) return done?.();

      void DOMScroll.scrollIntoViewAndWait(item.ref, {
        block: "nearest",
        inline: "center",
        behavior: "smooth",
      }).then(done);
    });
  }

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

      if (isPop) return scrollTo(target, finish);

      // Branch/forward navigation: A B C -> A B D. Remove old branch, then scroll to D.
      finish();
      scrollTo(target);
    },
  });

  return (
    <For each={rendered()}>
      {(item) => <Ref ref={(el) => (item.ref = el)}>{props.children(item.value, item.index)}</Ref>}
    </For>
  );
}

export * as PaneScroll from "./pane.scroll";
