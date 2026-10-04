import { animate } from "motion";

type Scroll = {
  readonly el: HTMLElement;
  readonly done: Promise<void>;
  readonly stop: () => void;
};

const active = new WeakMap<HTMLElement, Scroll>();

/**
 * Center `el` horizontally in its scroll parent; resolves once the scroll ends.
 *
 * We animate instead of native smooth scrolling: Safari can leave an interrupted
 * native scroll between `snap-mandatory` points. Snap is off while we animate and
 * the animation ends on a snap point. A click does not stop it; a scroll gesture
 * hands control back to native scrolling and its snap. A new call retargets.
 */
export function center(el: HTMLElement, behavior: ScrollBehavior = "smooth"): Promise<void> {
  const scroller = getScrollParent(el);

  if (!scroller) return Promise.resolve();

  const current = active.get(scroller);

  if (current?.el === el) return current.done;
  current?.stop();

  const target = centeredScrollLeft(el, scroller);

  if (behavior !== "smooth" || Math.abs(target - scroller.scrollLeft) <= 1) {
    scroller.scrollLeft = target;

    return Promise.resolve();
  }

  let settle!: () => void;
  const done = new Promise<void>((resolve) => (settle = resolve));

  const stop = () => {
    if (active.get(scroller) !== scroll) return;
    active.delete(scroller);
    animation.stop();
    scroller.removeEventListener("wheel", stop);
    scroller.removeEventListener("touchstart", stop);
    scroller.style.scrollSnapType = "";
    settle();
  };

  const scroll: Scroll = { el, done, stop };

  active.set(scroller, scroll);
  scroller.style.scrollSnapType = "none";
  scroller.addEventListener("wheel", stop, { passive: true });
  scroller.addEventListener("touchstart", stop, { passive: true });

  // `stop()` does not resolve motion's `finished`; settle through our own `stop`.
  const animation = animate(scroller.scrollLeft, target, {
    duration: 0.2,
    ease: "easeOut",
    onUpdate: (x) => (scroller.scrollLeft = x),
    onComplete: stop,
  });

  return done;
}

function centeredScrollLeft(el: HTMLElement, scroller: HTMLElement): number {
  const elRect = el.getBoundingClientRect();
  const scrollerRect = scroller.getBoundingClientRect();
  const offset = elRect.left + elRect.width / 2 - (scrollerRect.left + scrollerRect.width / 2);
  const max = scroller.scrollWidth - scroller.clientWidth;

  return Math.min(max, Math.max(0, scroller.scrollLeft + offset));
}

function getScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;

  while (node) {
    const { overflowX, overflowY } = getComputedStyle(node);

    if (/(auto|scroll|overlay)/.test(overflowX + overflowY)) return node;
    node = node.parentElement;
  }

  return null;
}

export * as DOMScroll from "./dom-scroll.ts";
