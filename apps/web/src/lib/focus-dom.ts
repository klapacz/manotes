import { useAtomSet, useAtomValue } from "@effect/atom-solid";
import { Effect, HashMap, Stream } from "effect";
import { AsyncResult, Atom } from "effect/unstable/reactivity";
import { onCleanup } from "solid-js";

export interface Target<Id, Options> {
  readonly id: Id;
  readonly element: HTMLElement;
  /** Receives the request's options; the requester decides how to scroll. */
  readonly focus?: (options: Options | undefined) => void;
}

/** Observe browser focus; move it only in response to an explicit request. */
export function create<Id, Options = never>() {
  const targets = Atom.make(HashMap.empty<Id, Target<Id, Options>>());
  const activeElement = browserFocus(document);

  // Both lookups derive from registration. There is no second mutable index.
  const elements = Atom.map(
    targets,
    (registered) =>
      new Map<Element, Id>(Array.from(registered, ([id, target]) => [target.element, id])),
  );

  const activeId = Atom.make((get) => closest(get(activeElement), get(elements)));

  const navigation = Atom.fn(({ id, options }: { id: Id; options?: Options }, get) => {
    const focus = Effect.gen(function* () {
      const ready = get.some(Atom.map(targets, (registered) => HashMap.get(registered, id))).pipe(
        // Registration can happen during rendering. Focus after that work
        // finishes, including when the target was already registered.
        Effect.tap(() => Effect.yieldNow),
      );

      // Native focus changes abandon only the wait. The losing subscription
      // is released before we invoke focus, so our own focus event cannot
      // cancel this operation.
      const target = yield* Effect.raceFirst(ready, interruptOnFocusChange(activeElement));

      yield* Effect.sync(() => {
        if (target.focus) target.focus(options);
        else target.element.focus({ preventScroll: true });
      });
    });

    // Publish the destination before waiting: the UI uses it to retain the
    // row and resolve repeated navigation. Stream completion ends pending.
    return Stream.concat(Stream.succeed(id), Stream.fromEffectDrain(focus));
  }).pipe(Atom.setIdleTTL(0));

  const pendingId = Atom.map(navigation, (result) =>
    AsyncResult.isSuccess(result) && result.waiting ? result.value : null,
  );

  const setTargets = useAtomSet(() => targets);
  const setNavigation = useAtomSet(() => navigation);

  const cancel = () => setNavigation(Atom.Reset);

  // Cancel immediately on provider disposal, independently of atom caching.
  onCleanup(cancel);

  return {
    activeElement: useAtomValue(() => activeElement),
    activeId: useAtomValue(() => activeId),
    pendingId: useAtomValue(() => pendingId),

    register(target: Target<Id, Options>) {
      setTargets((registered) => HashMap.set(registered, target.id, target));

      return () => setTargets((registered) => HashMap.remove(registered, target.id));
    },

    request: (id: Id, options?: Options) => {
      // Atom.fn interrupts the previous invocation and owns its cleanup.
      // An older invocation cannot overwrite its replacement's result.
      setNavigation({ id, options });
    },

    cancel,
  };
}

function browserFocus(document: Document): Atom.Atom<Element | null> {
  return Atom.make((get) => {
    const observe = () => get.setSelf(document.activeElement);

    // During focusout the next element may not yet own focus. Read after
    // the native transition; unchanged focus produces no atom update.
    const afterBlur = () => queueMicrotask(observe);

    document.addEventListener("focusin", observe);
    document.addEventListener("focusout", afterBlur);

    get.addFinalizer(() => {
      document.removeEventListener("focusin", observe);
      document.removeEventListener("focusout", afterBlur);
    });

    return document.activeElement;
  }).pipe(Atom.setIdleTTL(0));
}

function interruptOnFocusChange(activeElement: Atom.Atom<Element | null>) {
  return Atom.toStream(activeElement).pipe(
    Stream.drop(1), // The initial snapshot is not a focus change.
    // Losing focus to the body, e.g. when its element is removed, is not a choice.
    Stream.filter((element) => element !== null && element !== document.body),
    Stream.take(1),
    Stream.runDrain,
    Effect.andThen(Effect.interrupt),
  );
}

function closest<Id>(element: Element | null, elements: ReadonlyMap<Element, Id>): Id | null {
  for (let current = element; current; current = current.parentElement) {
    const id = elements.get(current);

    if (id !== undefined) return id;
  }

  return null;
}

export * as FocusDOM from "./focus-dom";
