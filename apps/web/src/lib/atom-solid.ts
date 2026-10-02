// Ported from @effect/atom-solid 4.0.0-rc.112 (dist/Hooks.js and
// dist/RegistryContext.js) for effect 4.0.0-rc.112.
// Copied because @effect/atom-solid requires Solid 1: it relies on
// `createComputed` and `createResource`, both removed in Solid 2.
// Modifications: only RegistryContext, useAtomValue and useAtom are kept, for
// the session and graph registry HTTP/RPC atoms. Subscriptions live in memos
// with `onCleanup` instead of `createComputed`, and reads go through
// `registry.get` keyed by a version signal so the first value is available
// synchronously.
/* eslint-disable anti-slop/require-safety-comment-for-type-assertion, anti-slop/no-runtime-typeof -- Ported setter overloads; values follow the Atom's own write type. */
import * as Cause from "effect/Cause";
import * as Effect from "effect/Effect";
import * as Exit from "effect/Exit";
import type * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import * as Atom from "effect/unstable/reactivity/Atom";
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import {
  createContext,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
} from "solid-js";

export const RegistryContext = createContext<AtomRegistry.AtomRegistry>(AtomRegistry.make());

export function useAtomValue<A>(atom: () => Atom.Atom<A>): Accessor<A>;
export function useAtomValue<A, B>(atom: () => Atom.Atom<A>, f: (_: A) => B): Accessor<B>;
export function useAtomValue<A, B>(atom: () => Atom.Atom<A>, f?: (_: A) => B) {
  const registry = useContext(RegistryContext);

  return f
    ? createAtomAccessor(registry, () => Atom.map(atom(), f))
    : createAtomAccessor(registry, atom);
}

export const useAtom = <R, W, const Mode extends "value" | "promise" | "promiseExit" = never>(
  atom: () => Atom.Writable<R, W>,
  options?: {
    readonly mode?: ([R] extends [AsyncResult.AsyncResult<any, any>] ? Mode : "value") | undefined;
  },
): readonly [value: Accessor<R>, write: AtomSetter<R, W, Mode>] => {
  const registry = useContext(RegistryContext);

  return [createAtomAccessor(registry, atom), setAtom(registry, createMemo(atom), options)];
};

type AtomSetter<R, W, Mode> = "promise" extends Mode
  ? (value: W) => Promise<AsyncResult.AsyncResult.Success<R>>
  : "promiseExit" extends Mode
    ? (
        value: W,
      ) => Promise<
        Exit.Exit<AsyncResult.AsyncResult.Success<R>, AsyncResult.AsyncResult.Failure<R>>
      >
    : (value: W | ((value: R) => W)) => void;

function createAtomAccessor<A>(
  registry: AtomRegistry.AtomRegistry,
  atom: () => Atom.Atom<A>,
): Accessor<A> {
  // Registry callbacks can run while Solid is computing, e.g. from a write in a memo.
  const [version, setVersion] = createSignal(0, { ownedWrite: true });

  const current = createMemo(() => {
    const value = atom();
    onCleanup(registry.subscribe(value, () => setVersion((version) => version + 1)));

    return value;
  });

  return createMemo(() => {
    version();

    return registry.get(current());
  });
}

function setAtom<R, W, Mode>(
  registry: AtomRegistry.AtomRegistry,
  atom: Accessor<Atom.Writable<R, W>>,
  options?: { readonly mode?: unknown },
): AtomSetter<R, W, Mode> {
  if (options?.mode === "promise" || options?.mode === "promiseExit") {
    const mode = options.mode;

    return ((value: W) => {
      registry.set(atom(), value);

      const promise = Effect.runPromiseExit(
        AtomRegistry.getResult(registry, atom() as Atom.Atom<AsyncResult.AsyncResult<any, any>>, {
          suspendOnWaiting: true,
        }),
      );

      return mode === "promise" ? promise.then(flattenExit) : promise;
    }) as AtomSetter<R, W, Mode>;
  }

  return ((value: W | ((value: R) => W)) => {
    registry.set(
      atom(),
      typeof value === "function" ? (value as (value: R) => W)(registry.get(atom())) : value,
    );
  }) as AtomSetter<R, W, Mode>;
}

function flattenExit<A, E>(exit: Exit.Exit<A, E>): A {
  if (Exit.isSuccess(exit)) return exit.value;

  throw Cause.squash(exit.cause);
}
