import { useAtom, useAtomSet, RegistryContext } from "@effect/atom-solid";
import { AsyncResult } from "effect/unstable/reactivity";
import * as Atom from "effect/unstable/reactivity/Atom";
import { createEffect, on, onCleanup, useContext, type Accessor } from "solid-js";
import { createStore, reconcile } from "solid-js/store";

export function createAtomStore<A extends object, E>(
  atom: () => Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  staticInitialValue: NoInfer<A>,
) {
  const registry = useContext(RegistryContext);
  const [store, setStore] = createStore<A>(staticInitialValue);

  createEffect(() => {
    const currentAtom = atom();
    const unsubscribe = registry.subscribe(
      currentAtom,
      (result) => {
        if (result._tag !== "Success") return;
        setStore(reconcile(result.value));
      },
      { immediate: true },
    );

    onCleanup(unsubscribe);
  });

  return store;
}

export function createAtomState<A>(initialValue: A) {
  const atom = Atom.make(initialValue);
  const [value, setValue] = useAtom(atom);

  return [value, setValue, atom] as const;
}

export function createSyncedAtom<A>(source: Accessor<A>) {
  const atom = Atom.make(source());
  const setAtom = useAtomSet(atom);

  createEffect(
    on(
      source,
      (value) => {
        setAtom(value);
      },
      { defer: true },
    ),
  );

  return atom;
}
