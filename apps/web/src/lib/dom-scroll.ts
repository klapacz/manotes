export function isCenteredInScrollParent(el: HTMLElement, tolerance = 1): boolean {
  const container = getScrollParent(el);
  if (!container) return true;

  const elRect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  const elCenter = elRect.left + elRect.width / 2;
  const containerCenter = containerRect.left + containerRect.width / 2;

  return Math.abs(elCenter - containerCenter) <= tolerance;
}

export function getScrollParent(el: HTMLElement): HTMLElement | null {
  let node = el.parentElement;
  while (node) {
    const { overflowX, overflowY } = getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(overflowX + overflowY)) return node;
    node = node.parentElement;
  }
  return null;
}

export function waitForScroll(el: HTMLElement, timeout = 600): Promise<void> {
  const container = getScrollParent(el);
  return new Promise((resolve) => {
    let timer: number;
    const done = () => {
      container?.removeEventListener("scrollend", done);
      clearTimeout(timer);
      resolve();
    };
    container?.addEventListener("scrollend", done, { once: true });
    timer = window.setTimeout(done, timeout);
  });
}

export * as DOMScroll from "./dom-scroll.ts";
