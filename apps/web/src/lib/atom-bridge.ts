import { Cause, Effect, Exit } from "effect";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import { createMemo, createRenderEffect, from, onCleanup, untrack, type Accessor } from "solid-js";

export class EffectFailure<E> extends Error {
  constructor(readonly cause: Cause.Cause<E>) {
    super(Cause.pretty(cause));
    this.name = "EffectFailure";
  }
}

/** Read reactive inputs in start, before handing the work to an Effect runtime. */
export function createEffectValue<A, E>(start: (signal: AbortSignal) => Promise<Exit.Exit<A, E>>) {
  return createMemo(() => run(start));
}

export function createAtomValue<A>(
  registry: AtomRegistry.AtomRegistry,
  atom: Accessor<Atom.Atom<A>>,
) {
  return createMemo(() => {
    const current = atom();

    return from<A>((next) => registry.subscribe(current, next, { immediate: true }));
  });
}

/** Keep the raw subscription alive across failures so a retry can recover. */
export function createAsyncAtom<A, E>(
  registry: AtomRegistry.AtomRegistry,
  atom: Accessor<Atom.Atom<AsyncResult.AsyncResult<A, E>>>,
  suspendOnWaiting = false,
) {
  const selected = createMemo(atom);
  const result = createAtomValue(registry, selected);

  const value = createMemo(() => {
    const state = result();

    // An open Effect stream keeps waiting=true even after yielding a usable value.
    if (AsyncResult.isInitial(state) || (suspendOnWaiting && state.waiting)) {
      const current = selected();

      return run((signal) => {
        return Effect.runPromiseExit(
          AtomRegistry.getResult(registry, current, { suspendOnWaiting }),
          { signal },
        );
      });
    }

    if (AsyncResult.isSuccess(state)) return state.value;

    throw new EffectFailure(state.cause);
  });

  return { result, value, refresh: () => registry.refresh(untrack(selected)) };
}

export function createSyncedAtom<A>(registry: AtomRegistry.AtomRegistry, source: Accessor<A>) {
  const atom = Atom.make(untrack(source));

  createRenderEffect(source, (value) => registry.set(atom, value));

  return atom;
}

function run<A, E>(start: (signal: AbortSignal) => Promise<Exit.Exit<A, E>>): Promise<A> {
  const controller = new AbortController();

  onCleanup(() => controller.abort());

  return start(controller.signal).then((exit) => {
    if (Exit.isSuccess(exit)) return exit.value;

    throw new EffectFailure(exit.cause);
  });
}
