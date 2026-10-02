import { HashMap, Option } from "effect";
import { createMemo, createSignal, onCleanup, runWithOwner, untrack, until } from "solid-js";

export interface Target<Id, Options> {
  readonly id: Id;
  readonly element: HTMLElement;
  /** Receives the request's options; the requester decides how to scroll. */
  readonly focus?: (options: Options | undefined) => void;
}

/** Observe browser focus; move it only in response to an explicit request. */
export function create<Id, Options = never>() {
  // Targets unregister from disposal cleanups, which run in owned scopes.
  // Ids are Data values: HashMap keys compare them structurally.
  const [targets, setTargets] = createSignal(HashMap.empty<Id, Target<Id, Options>>(), {
    ownedWrite: true,
  });

  const activeElement = browserFocus(document);

  // Both lookups derive from registration. There is no second mutable index.
  const elements = createMemo(
    () => new Map<Element, Id>(Array.from(targets(), ([id, target]) => [target.element, id])),
  );

  const activeId = createMemo(() => closest(activeElement(), elements()));

  // The destination reads while the navigation waits. Navigation is not an
  // action: a transaction would hold the very renders the target waits for.
  const [pending, setPending] = createSignal<{ readonly id: Id } | null>(null, {
    ownedWrite: true,
  });

  const pendingId = () => pending()?.id ?? null;
  let inFlight: AbortController | undefined;

  const navigate = async (id: Id, options: Options | undefined, signal: AbortSignal) => {
    const start = untrack(activeElement);

    // Native focus changes abandon only the wait. Requests can come from
    // `onSettled`, where creating the wait's computation is forbidden.
    const outcome = await runWithOwner(null, () =>
      until(
        () => {
          const element = activeElement();

          if (element !== start && element !== null && element !== document.body) return ABANDONED;

          return Option.getOrUndefined(HashMap.get(targets(), id));
        },
        { signal },
      ),
    );

    if (outcome === ABANDONED) return;

    // Registration can happen during rendering. Focus after that work
    // finishes, including when the target was already registered.
    await new Promise((resolve) => setTimeout(resolve, 0));

    if (signal.aborted) return;

    // Settle before focusing: the target may issue the next request.
    finish(signal);

    if (outcome.focus) outcome.focus(options);
    else outcome.element.focus({ preventScroll: true });
  };

  const finish = (signal: AbortSignal) => {
    if (inFlight?.signal !== signal) return;

    inFlight = undefined;
    setPending(null);
  };

  const cancel = () => {
    inFlight?.abort();
    inFlight = undefined;
    setPending(null);
  };

  // Cancel immediately on provider disposal.
  onCleanup(cancel);

  return {
    activeElement,
    activeId,
    pendingId,

    register(target: Target<Id, Options>) {
      setTargets((registered) => HashMap.set(registered, target.id, target));

      return () =>
        setTargets((registered) =>
          Option.getOrUndefined(HashMap.get(registered, target.id)) === target
            ? HashMap.remove(registered, target.id)
            : registered,
        );
    },

    request: (id: Id, options?: Options) => {
      // A new request replaces the previous one.
      cancel();
      const controller = new AbortController();
      inFlight = controller;
      setPending({ id });

      void navigate(id, options, controller.signal).finally(() => finish(controller.signal));
    },

    cancel,
  };
}

const ABANDONED = Symbol("abandoned");

function browserFocus(document: Document) {
  const [activeElement, setActiveElement] = createSignal<Element | null>(document.activeElement, {
    // Focus events can fire synchronously from DOM work during an update.
    ownedWrite: true,
  });

  const observe = () => setActiveElement(document.activeElement);

  // During focusout the next element may not yet own focus. Read after the
  // native transition; unchanged focus produces no update.
  const afterBlur = () => queueMicrotask(observe);

  document.addEventListener("focusin", observe);
  document.addEventListener("focusout", afterBlur);

  onCleanup(() => {
    document.removeEventListener("focusin", observe);
    document.removeEventListener("focusout", afterBlur);
  });

  return activeElement;
}

function closest<Id>(element: Element | null, elements: ReadonlyMap<Element, Id>): Id | null {
  for (let current = element; current; current = current.parentElement) {
    const id = elements.get(current);

    if (id !== undefined) return id;
  }

  return null;
}

export * as FocusDOM from "./focus-dom";
