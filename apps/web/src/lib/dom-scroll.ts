/** Center `el` in its scroll parent; resolves once a smooth scroll settles there. */
export function center(el: HTMLElement, behavior: ScrollBehavior = "smooth"): Promise<void> {
  if (isCenteredInScrollParent(el)) return Promise.resolve();

  const centered = behavior === "smooth" ? waitForCenter(el) : Promise.resolve();
  el.scrollIntoView({ block: "nearest", inline: "center", behavior });

  return centered;
}

function isCenteredInScrollParent(el: HTMLElement, tolerance = 1): boolean {
  const container = getScrollParent(el);

  if (!container) return true;

  const elRect = el.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();

  const elCenter = elRect.left + elRect.width / 2;
  const containerCenter = containerRect.left + containerRect.width / 2;

  return Math.abs(elCenter - containerCenter) <= tolerance;
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

/** Resolve once `el` settles centered in its scroll parent, or after `timeout`. */
function waitForCenter(el: HTMLElement, timeout = 1000): Promise<void> {
  const container = getScrollParent(el);

  return new Promise((resolve) => {
    let timer: number;

    // An interrupted earlier scroll can end first; keep waiting for this one.
    const check = () => {
      if (isCenteredInScrollParent(el)) done();
    };

    const done = () => {
      container?.removeEventListener("scrollend", check);
      clearTimeout(timer);
      resolve();
    };

    container?.addEventListener("scrollend", check);
    timer = window.setTimeout(done, timeout);
  });
}

export * as DOMScroll from "./dom-scroll.ts";
