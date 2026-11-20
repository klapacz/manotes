import type { JSX } from "@solidjs/web";
/* eslint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion -- Solid accepts reactive accessors as JSX; generic tag dispatch needs type bridges. */
/* eslint-disable anti-slop-effect/no-manual-tag-comparison, anti-slop-effect/no-manual-tagged-construction -- Keep direct dispatch and plain tagged states in these reactive rendering helpers. */
import { useAtom, useAtomValue, RegistryContext } from "./atom-solid";
import { Match, Types } from "effect";
import { AsyncResult, Atom } from "effect/reactivity";
import { createMemo, createProjection, untrack, useContext, type Accessor } from "solid-js";
import { createSyncedAtom as syncAtom } from "./atom-bridge";

export interface MatchTagProps<E extends { readonly _tag: string }> {
  readonly when: E;
  readonly keyed?: boolean | undefined;
  readonly fallback?: JSX.Element | undefined;
  readonly cases?:
    | Partial<{
        [K in Types.Tags<E>]: (value: Accessor<Types.ExtractTag<E, K>>) => JSX.Element;
      }>
    | undefined;
}

export function MatchTag<E extends { readonly _tag: string }>(
  props: MatchTagProps<E>,
): JSX.Element {
  const stateValue = createMemo(() => props.when, { name: "tagged value" });

  const state = props.keyed
    ? stateValue
    : createMemo(stateValue, {
        equals: (a, b) => a._tag === b._tag,
        name: "tagged branch",
      });

  return createMemo(
    () => {
      const current = state();

      const render = props.cases?.[current._tag as Types.Tags<E>] as
        | ((value: Accessor<E>) => JSX.Element)
        | undefined;

      if (!render) return props.fallback ?? null;

      // Outgoing consumers can still read during a branch change (for example,
      // a portalled graph menu while locking). Keep their value on the old tag.
      const branchValue = createMemo(
        (previous: E) => {
          const next = stateValue();

          return next._tag === current._tag ? next : previous;
        },
        { loadingValue: current },
      );

      return untrack(() => render(branchValue));
    },
    { name: "value" },
  ) as unknown as JSX.Element;
}

export interface MatchAsyncResultProps<A, E> {
  readonly when: AsyncResult.AsyncResult<A, E>;
  readonly keyed?: boolean | undefined;
  readonly fallback?: JSX.Element | undefined;
  readonly onInitial?: ((result: Accessor<AsyncResult.Initial<A, E>>) => JSX.Element) | undefined;
  readonly onSuccess?:
    | ((value: Accessor<A>, result: Accessor<AsyncResult.Success<A, E>>) => JSX.Element)
    | undefined;
  readonly onFailure?: ((result: Accessor<AsyncResult.Failure<A, E>>) => JSX.Element) | undefined;
  readonly onError?:
    | ((error: Accessor<E>, result: Accessor<AsyncResult.Failure<A, E>>) => JSX.Element)
    | undefined;
  readonly onDefect?:
    | ((defect: Accessor<unknown>, result: Accessor<AsyncResult.Failure<A, E>>) => JSX.Element)
    | undefined;
}

export function MatchAsyncResult<A, E>(props: MatchAsyncResultProps<A, E>): JSX.Element {
  const stateValue = createMemo(
    () => {
      return AsyncResult.matchWithError(props.when, {
        onInitial: (result) => ({ _tag: "Initial" as const, result }),
        onSuccess: (result) => ({ _tag: "Success" as const, result }),
        onError: (error, result) => ({ _tag: "Error" as const, error, result }),
        onDefect: (defect, result) => ({ _tag: "Defect" as const, defect, result }),
      });
    },
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
    : createMemo(stateValue, {
        equals: (a, b) => a._tag === b._tag,
        name: "async result branch",
      });

  return createMemo(
    () => {
      return Match.value(state()).pipe(
        Match.tag("Initial", () => {
          const onInitial = props.onInitial;

          return onInitial
            ? untrack(() => onInitial(() => expectState("Initial").result))
            : (props.fallback ?? null);
        }),
        Match.tag("Success", () => {
          const onSuccess = props.onSuccess;

          return onSuccess
            ? untrack(() => {
                return onSuccess(
                  () => expectState("Success").result.value,
                  () => expectState("Success").result,
                );
              })
            : (props.fallback ?? null);
        }),
        Match.tag("Error", () => {
          const onError = props.onError;
          const onFailure = props.onFailure;

          return onError
            ? untrack(() => {
                return onError(
                  () => expectState("Error").error,
                  () => expectState("Error").result,
                );
              })
            : onFailure
              ? untrack(() => onFailure(() => expectState("Error").result))
              : (props.fallback ?? null);
        }),
        Match.tag("Defect", () => {
          const onDefect = props.onDefect;
          const onFailure = props.onFailure;

          return onDefect
            ? untrack(() => {
                return onDefect(
                  () => expectState("Defect").defect,
                  () => expectState("Defect").result,
                );
              })
            : onFailure
              ? untrack(() => onFailure(() => expectState("Defect").result))
              : (props.fallback ?? null);
        }),
        Match.exhaustive,
      );
    },
    { name: "value" },
  ) as unknown as JSX.Element;
}

export function createAtomStore<A, E>(
  atom: () => Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  staticInitialValue: NoInfer<A>,
) {
  const result = useAtomValue(atom);

  return createProjection<{ value: A }>(
    () => {
      const current = result();

      if (AsyncResult.isSuccess(current)) return { value: current.value };
    },
    { value: staticInitialValue },
  );
}

export type AtomResultStore<A> =
  | { readonly _tag: "Loading" }
  | { readonly _tag: "Success"; readonly value: A }
  | { readonly _tag: "Error" };

export function createAtomResultStore<A, E>(atom: () => Atom.Atom<AsyncResult.AsyncResult<A, E>>) {
  const result = useAtomValue(atom);

  return createProjection<AtomResultStore<A>>(
    () => {
      const current = result();

      return AsyncResult.match(current, {
        onInitial: () => ({ _tag: "Loading" }),
        onSuccess: ({ value }) => ({ _tag: "Success", value }),
        onFailure: () => ({ _tag: "Error" }),
      });
    },
    { _tag: "Loading" },
  );
}

export function createAtomState<A>(initialValue: A) {
  const atom = Atom.make(initialValue);
  const [value, setValue] = useAtom(() => atom);

  return [value, setValue, atom] as const;
}

export function createSyncedAtom<A>(source: Accessor<A>) {
  return syncAtom(useContext(RegistryContext), source);
}
