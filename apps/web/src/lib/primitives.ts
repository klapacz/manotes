import { useAtom, useAtomSet, RegistryContext } from "@effect/atom-solid";
import { Types } from "effect";
import { AsyncResult } from "effect/unstable/reactivity";
import * as Atom from "effect/unstable/reactivity/Atom";
import {
  createEffect,
  createMemo,
  on,
  onCleanup,
  untrack,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { createStore, reconcile } from "solid-js/store";

export interface MatchAsyncResultProps<A, E> {
  readonly when: AsyncResult.AsyncResult<A, E>;
  readonly keyed?: boolean | undefined;
  readonly fallback?: JSX.Element | undefined;
  readonly onInitial?: ((result: Accessor<AsyncResult.Initial<A, E>>) => JSX.Element) | undefined;
  readonly onSuccess?:
    | ((value: Accessor<A>, result: Accessor<AsyncResult.Success<A, E>>) => JSX.Element)
    | undefined;
  readonly onError?:
    | ((error: Accessor<E>, result: Accessor<AsyncResult.Failure<A, E>>) => JSX.Element)
    | undefined;
  readonly onDefect?:
    | ((defect: Accessor<unknown>, result: Accessor<AsyncResult.Failure<A, E>>) => JSX.Element)
    | undefined;
}

export function MatchAsyncResult<A, E>(props: MatchAsyncResultProps<A, E>): JSX.Element {
  const stateValue = createMemo(
    () =>
      AsyncResult.matchWithError(props.when, {
        onInitial: (result) => ({ _tag: "Initial" as const, result }),
        onSuccess: (result) => ({ _tag: "Success" as const, result }),
        onError: (error, result) => ({ _tag: "Error" as const, error, result }),
        onDefect: (defect, result) => ({ _tag: "Defect" as const, defect, result }),
      }),
    undefined,
    { name: "async result value" },
  );

  type State = ReturnType<typeof stateValue>;

  function expectState<TTag extends Types.Tags<State>>(tag: TTag): Types.ExtractTag<State, TTag> {
    const current = stateValue();
    if (current._tag !== tag) throw new Error("MatchAsyncResult");
    return current as Types.ExtractTag<State, TTag>;
  }

  const state = props.keyed
    ? stateValue
    : createMemo(stateValue, undefined, {
        equals: (a, b) => a._tag === b._tag,
        name: "async result branch",
      });

  return createMemo(
    () => {
      switch (state()._tag) {
        case "Initial": {
          const onInitial = props.onInitial;
          return onInitial
            ? untrack(() => onInitial(() => expectState("Initial").result))
            : (props.fallback ?? null);
        }
        case "Success": {
          const onSuccess = props.onSuccess;
          return onSuccess
            ? untrack(() =>
                onSuccess(
                  () => expectState("Success").result.value,
                  () => expectState("Success").result,
                ),
              )
            : (props.fallback ?? null);
        }
        case "Error": {
          const onError = props.onError;
          return onError
            ? untrack(() =>
                onError(
                  () => expectState("Error").error,
                  () => expectState("Error").result,
                ),
              )
            : (props.fallback ?? null);
        }
        case "Defect": {
          const onDefect = props.onDefect;
          return onDefect
            ? untrack(() =>
                onDefect(
                  () => expectState("Defect").defect,
                  () => expectState("Defect").result,
                ),
              )
            : (props.fallback ?? null);
        }
      }
    },
    undefined,
    { name: "value" },
  ) as unknown as JSX.Element;
}

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
