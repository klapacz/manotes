/* eslint-disable anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-runtime-typeof -- Preserve upstream generic atom setter overload dispatch; the mode constrains the result and function values are updater callbacks. */
// Adapted from @effect/atom-solid 4.0.3 src/Hooks.ts.
// Keep the app's atom API while using Solid 2 subscriptions and native async memos.
import { Cause, Effect, Exit } from "effect";
import { AsyncResult, Atom, AtomRegistry } from "effect/reactivity";
import {
  createContext,
  createMemo,
  createRenderEffect,
  latest,
  untrack,
  useContext,
  type Accessor,
} from "solid-js";
import { createAtomValue, createAsyncAtom } from "./atom-bridge";

export const RegistryContext = createContext(AtomRegistry.make());

export function useAtomValue<A>(atom: () => Atom.Atom<A>): Accessor<A> {
  return createAtomValue(useContext(RegistryContext), atom);
}

function mountAtom<A>(registry: AtomRegistry.AtomRegistry, atom: () => Atom.Atom<A>): void {
  createRenderEffect(atom, (current) => registry.mount(current));
}

export function useAtomMount<A>(atom: () => Atom.Atom<A>): void {
  mountAtom(useContext(RegistryContext), atom);
}

export function useAtomSubscribe<A>(
  atom: () => Atom.Atom<A>,
  listener: (value: A) => void,
  options?: { immediate?: boolean },
): void {
  const registry = useContext(RegistryContext);
  createRenderEffect(atom, (current) => registry.subscribe(current, listener, options));
}

export function useAtomResource<A, E>(
  atom: () => Atom.Atom<AsyncResult.AsyncResult<A, E>>,
  options?: { suspendOnWaiting?: boolean },
) {
  const async = createAsyncAtom(useContext(RegistryContext), atom, options?.suspendOnWaiting);

  return [async.value, { refetch: async.refresh }] as const;
}

function setAtom<R, W, Mode extends "value" | "promise" | "promiseExit" = never>(
  registry: AtomRegistry.AtomRegistry,
  atom: () => Atom.Writable<R, W>,
  options?: {
    readonly mode?: ([R] extends [AsyncResult.AsyncResult<any, any>] ? Mode : "value") | undefined;
  },
): "promise" extends Mode
  ? (value: W) => Promise<AsyncResult.AsyncResult.Success<R>>
  : "promiseExit" extends Mode
    ? (
        value: W,
      ) => Promise<
        Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>
      >
    : (value: W | ((value: R) => W)) => void {
  const memo = createMemo(atom);
  // Writes sample the latest target, including while an async UI retains its previous result.
  const selected = () => untrack(() => latest(memo));

  if (options?.mode === "promise" || options?.mode === "promiseExit") {
    return ((value: W) => {
      const current = selected();
      registry.set(current, value);

      const promise = Effect.runPromiseExit(
        AtomRegistry.getResult(registry, current as Atom.Atom<AsyncResult.AsyncResult<any, any>>, {
          suspendOnWaiting: true,
        }),
      );

      return options!.mode === "promise" ? promise.then(flattenExit) : promise;
    }) as any;
  }

  return ((value: W | ((value: R) => W)) => {
    const current = selected();
    registry.set(
      current,
      typeof value === "function" ? (value as any)(registry.get(current)) : value,
    );
  }) as any;
}

const flattenExit = <A, E>(exit: Exit.Exit<A, E>): A => {
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
};

export const useAtomSet = <R, W, Mode extends "value" | "promise" | "promiseExit" = never>(
  atom: () => Atom.Writable<R, W>,
  options?: {
    readonly mode?: ([R] extends [AsyncResult.AsyncResult<any, any>] ? Mode : "value") | undefined;
  },
): "promise" extends Mode
  ? (value: W) => Promise<AsyncResult.AsyncResult.Success<R>>
  : "promiseExit" extends Mode
    ? (
        value: W,
      ) => Promise<
        Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>
      >
    : (value: W | ((value: R) => W)) => void => {
  const registry = useContext(RegistryContext);
  mountAtom(registry, atom);

  return setAtom(registry, atom, options);
};

export const useAtom = <R, W, const Mode extends "value" | "promise" | "promiseExit" = never>(
  atom: () => Atom.Writable<R, W>,
  options?: {
    readonly mode?: ([R] extends [AsyncResult.AsyncResult<any, any>] ? Mode : "value") | undefined;
  },
): readonly [
  value: Accessor<R>,
  write: "promise" extends Mode
    ? (value: W) => Promise<AsyncResult.AsyncResult.Success<R>>
    : "promiseExit" extends Mode
      ? (
          value: W,
        ) => Promise<
          Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>
        >
      : (value: W | ((value: R) => W)) => void,
] => {
  const registry = useContext(RegistryContext);

  return [createAtomValue(registry, atom), setAtom(registry, atom, options)] as const;
};
