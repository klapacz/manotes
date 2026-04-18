import { RegistryContext } from "@effect/atom-solid";
import { Cause, Effect, Exit } from "effect";
import type { Stream } from "effect";
import type * as Scope from "effect/Scope";
import type * as SubscriptionRef from "effect/SubscriptionRef";
import type * as AsyncResult from "effect/unstable/reactivity/AsyncResult";
import type * as Atom from "effect/unstable/reactivity/Atom";
import * as AtomRegistry from "effect/unstable/reactivity/AtomRegistry";
import type * as Reactivity from "effect/unstable/reactivity/Reactivity";
import {
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
} from "solid-js";
import { createAtomStore } from "./primitives";

const TypeId: unique symbol = Symbol.for("manotes/RuntimeAtom");

type RuntimeGetter<R, ER> = () => Atom.AtomRuntime<R, ER>;
type RuntimeRequirements<R> = Scope.Scope | AtomRegistry.AtomRegistry | Reactivity.Reactivity | R;
type StreamRequirements<R> = AtomRegistry.AtomRegistry | Reactivity.Reactivity | R;
type ReactivityKeys = ReadonlyArray<unknown> | Readonly<Record<string, ReadonlyArray<unknown>>>;
type FnOptions<A> = {
  readonly initialValue?: A | undefined;
  readonly reactivityKeys?: ReactivityKeys | undefined;
  readonly concurrent?: boolean | undefined;
};
type AtomOptions<A> = {
  readonly initialValue?: A;
  readonly uninterruptible?: boolean | undefined;
};
type PullOptions<A> = {
  readonly disableAccumulation?: boolean;
  readonly initialValue?: ReadonlyArray<A>;
};
type ValueDispatch<Arg> = [Arg] extends [void] ? () => void : (arg: Arg) => void;
type PromiseDispatch<Arg, A> = [Arg] extends [void] ? () => Promise<A> : (arg: Arg) => Promise<A>;
type PromiseExitDispatch<Arg, A, E> = [Arg] extends [void]
  ? () => Promise<Exit.Exit<A, E>>
  : (arg: Arg) => Promise<Exit.Exit<A, E>>;

export interface RuntimeAtomFn<Arg, A, E, R, ER> {
  readonly [TypeId]: typeof TypeId;
  readonly bind: (rt: Atom.AtomRuntime<R, ER>) => Atom.AtomResultFn<Arg, A, E>;
}

export interface RuntimeAtomRead<A, E, R, ER> {
  readonly [TypeId]: typeof TypeId;
  readonly bind: (rt: Atom.AtomRuntime<R, ER>) => Atom.Atom<AsyncResult.AsyncResult<A, E>>;
}

export interface RuntimeAtomSubscriptionRef<A, E, R, ER> extends RuntimeAtomRead<A, E, R, ER> {
  readonly bind: (rt: Atom.AtomRuntime<R, ER>) => Atom.Writable<AsyncResult.AsyncResult<A, E>, A>;
}

export interface RuntimeAtomPull<A, E, R, ER> {
  readonly [TypeId]: typeof TypeId;
  readonly bind: (rt: Atom.AtomRuntime<R, ER>) => Atom.Writable<Atom.PullResult<A, E>, void>;
}

export function makeRtAtomFactory<R, ER>(getRt: RuntimeGetter<R, ER>) {
  type RuntimeAtomType = Atom.AtomRuntime<R, ER>;

  // The factory returns runtime-agnostic wrappers. Each wrapper binds lazily to
  // the current graph runtime from context, so components can declare atoms once
  // and still swap runtimes without rebuilding every call site.
  const fn: {
    <Arg, A, E>(
      effect: (arg: Arg, get: Atom.FnContext) => Effect.Effect<A, E, RuntimeRequirements<R>>,
      options?: FnOptions<A>,
    ): RuntimeAtomFn<Arg, A, E | ER, R, ER>;
    <Arg, A, E>(
      stream: (arg: Arg, get: Atom.FnContext) => Stream.Stream<A, E, StreamRequirements<R>>,
      options?: FnOptions<A>,
    ): RuntimeAtomFn<Arg, A, E | ER | Cause.NoSuchElementError, R, ER>;
  } = <Arg, A, E>(
    create:
      | ((arg: Arg, get: Atom.FnContext) => Effect.Effect<A, E, RuntimeRequirements<R>>)
      | ((arg: Arg, get: Atom.FnContext) => Stream.Stream<A, E, StreamRequirements<R>>),
    options?: FnOptions<A>,
  ) => {
    // Atom identity has to stay stable per runtime so the registry can preserve
    // subscriptions, pending state, and cached values across re-renders.
    const cache = new WeakMap<RuntimeAtomType, Atom.AtomResultFn<Arg, A, E>>();

    return {
      [TypeId]: TypeId,
      bind(rt) {
        const cached = cache.get(rt);
        if (cached) return cached;

        const bound = rt.fn(create as never, options as never) as Atom.AtomResultFn<Arg, A, E>;
        cache.set(rt, bound);
        return bound;
      },
    };
  };

  const atom: {
    <A, E>(
      effect: Effect.Effect<A, E, RuntimeRequirements<R>>,
      options?: AtomOptions<A>,
    ): RuntimeAtomRead<A, E | ER, R, ER>;
    <A, E>(
      stream: Stream.Stream<A, E, StreamRequirements<R>>,
      options?: AtomOptions<A>,
    ): RuntimeAtomRead<A, E | ER | Cause.NoSuchElementError, R, ER>;
    <A, E>(
      create: (get: Atom.AtomContext) => Effect.Effect<A, E, RuntimeRequirements<R>>,
      options?: AtomOptions<A>,
    ): RuntimeAtomRead<A, E | ER, R, ER>;
    <A, E>(
      create: (get: Atom.AtomContext) => Stream.Stream<A, E, StreamRequirements<R>>,
      options?: AtomOptions<A>,
    ): RuntimeAtomRead<A, E | ER | Cause.NoSuchElementError, R, ER>;
  } = <A, E>(
    create:
      | Effect.Effect<A, E, RuntimeRequirements<R>>
      | Stream.Stream<A, E, StreamRequirements<R>>
      | ((
          get: Atom.AtomContext,
        ) =>
          | Effect.Effect<A, E, RuntimeRequirements<R>>
          | Stream.Stream<A, E, StreamRequirements<R>>),
    options?: AtomOptions<A>,
  ) => {
    // Read atoms follow the same pattern as fn wrappers: cache the bound atom so
    // one runtime always maps to one registry node.
    const cache = new WeakMap<RuntimeAtomType, Atom.Atom<AsyncResult.AsyncResult<A, E>>>();

    return {
      [TypeId]: TypeId,
      bind(rt: RuntimeAtomType) {
        const cached = cache.get(rt);
        if (cached) return cached;

        const bound = rt.atom(create as never, options as never) as Atom.Atom<
          AsyncResult.AsyncResult<A, E>
        >;
        cache.set(rt, bound);
        return bound;
      },
    };
  };

  const subscriptionRef: {
    <A, E>(
      effect: Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, RuntimeRequirements<R>>,
    ): RuntimeAtomSubscriptionRef<A, E | ER, R, ER>;
    <A, E>(
      create: (
        get: Atom.AtomContext,
      ) => Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, RuntimeRequirements<R>>,
    ): RuntimeAtomSubscriptionRef<A, E | ER, R, ER>;
  } = <A, E>(
    create:
      | Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, RuntimeRequirements<R>>
      | ((
          get: Atom.AtomContext,
        ) => Effect.Effect<SubscriptionRef.SubscriptionRef<A>, E, RuntimeRequirements<R>>),
  ) => {
    // Subscription refs are used for long-lived mutable session state. Keeping a
    // stable bound identity per runtime is what lets the registry cleanly tear
    // down the old session when the runtime changes.
    const cache = new WeakMap<RuntimeAtomType, Atom.Writable<AsyncResult.AsyncResult<A, E>, A>>();

    return {
      [TypeId]: TypeId,
      bind(rt: RuntimeAtomType) {
        const cached = cache.get(rt);
        if (cached) return cached;

        const bound = rt.subscriptionRef(create as never) as Atom.Writable<
          AsyncResult.AsyncResult<A, E>,
          A
        >;
        cache.set(rt, bound);
        return bound;
      },
    };
  };

  const pull: {
    <A, E>(
      stream: Stream.Stream<A, E, StreamRequirements<R>>,
      options?: PullOptions<A>,
    ): RuntimeAtomPull<A, E | ER, R, ER>;
    <A, E>(
      create: (get: Atom.AtomContext) => Stream.Stream<A, E, StreamRequirements<R>>,
      options?: PullOptions<A>,
    ): RuntimeAtomPull<A, E | ER, R, ER>;
  } = <A, E>(
    create:
      | Stream.Stream<A, E, StreamRequirements<R>>
      | ((get: Atom.AtomContext) => Stream.Stream<A, E, StreamRequirements<R>>),
    options?: PullOptions<A>,
  ) => {
    // Pull atoms are imperative, but they still need the same per-runtime
    // identity guarantees as the read and fn helpers above.
    const cache = new WeakMap<RuntimeAtomType, Atom.Writable<Atom.PullResult<A, E>, void>>();

    return {
      [TypeId]: TypeId,
      bind(rt: RuntimeAtomType) {
        const cached = cache.get(rt);
        if (cached) return cached;

        const bound = rt.pull(create as never, options as never) as Atom.Writable<
          Atom.PullResult<A, E>,
          void
        >;
        cache.set(rt, bound);
        return bound;
      },
    };
  };

  const use: {
    <Arg, A, E>(
      rtAtom: RuntimeAtomFn<Arg, A, E, R, ER>,
      options?: {
        readonly mode?: "value" | undefined;
      },
    ): readonly [Accessor<AsyncResult.AsyncResult<A, E>>, ValueDispatch<Arg>];
    <Arg, A, E>(
      rtAtom: RuntimeAtomFn<Arg, A, E, R, ER>,
      options: {
        readonly mode: "promise";
      },
    ): readonly [Accessor<AsyncResult.AsyncResult<A, E>>, PromiseDispatch<Arg, A>];
    <Arg, A, E>(
      rtAtom: RuntimeAtomFn<Arg, A, E, R, ER>,
      options: {
        readonly mode: "promiseExit";
      },
    ): readonly [Accessor<AsyncResult.AsyncResult<A, E>>, PromiseExitDispatch<Arg, A, E>];
  } = <Arg, A, E>(
    rtAtom: RuntimeAtomFn<Arg, A, E, R, ER>,
    options?: {
      readonly mode?: "value" | "promise" | "promiseExit" | undefined;
    },
  ) => {
    // `use` mirrors `useAtom`: expose the async result plus a setter, but first
    // rebind the wrapper against the currently selected runtime.
    const atom = bindToRuntime(getRt, rtAtom);
    return [useBoundAtomValue(atom), useBoundAtomSetter(atom, options)] as const;
  };

  function useValue<A, E>(
    rtAtom: RuntimeAtomRead<A, E, R, ER>,
  ): Accessor<AsyncResult.AsyncResult<A, E>> {
    return useBoundAtomValue(bindToRuntime(getRt, rtAtom));
  }

  function useMount(
    rtAtom:
      | RuntimeAtomRead<any, any, R, ER>
      | RuntimeAtomFn<any, any, any, R, ER>
      | RuntimeAtomPull<any, any, R, ER>,
  ) {
    const atom = bindToRuntime(getRt, rtAtom);
    const registry = useContext(RegistryContext);

    createEffect(() => {
      const currentAtom = atom();
      // Some callers only need to keep a runtime-bound atom alive for its
      // background work and never need the current value in component state.
      const unmount = registry.mount(currentAtom);

      onCleanup(unmount);
    });
  }

  function useStore<A extends object, E>(
    rtAtom: RuntimeAtomRead<A, E, R, ER>,
    staticInitialValue: NoInfer<A>,
  ) {
    // Object stores keep the existing reconcile-based behavior used elsewhere in
    // the app while sourcing their data from a runtime-bound atom.
    return createAtomStore(bindToRuntime(getRt, rtAtom), staticInitialValue);
  }

  return {
    fn,
    atom,
    subscriptionRef,
    pull,
    use,
    useValue,
    useMount,
    useStore,
  };
}

function bindToRuntime<R, ER, A>(
  getRt: RuntimeGetter<R, ER>,
  rtAtom: {
    bind: (rt: Atom.AtomRuntime<R, ER>) => A;
  },
): Accessor<A> {
  // The runtime lives in Solid context. Memoizing the bound atom keeps the atom
  // stable for normal re-renders, but still rebinds when the active runtime
  // instance changes.
  return createMemo(() => rtAtom.bind(getRt()));
}

function useBoundAtomValue<A>(atom: Accessor<Atom.Atom<A>>): Accessor<A> {
  const registry = useContext(RegistryContext);
  const [value, setValue] = createSignal<A>(registry.get(atom()));

  createEffect(() => {
    const currentAtom = atom();
    // This is the same subscribe/immediate pattern as `@effect/atom-solid`, but
    // it works on an accessor because binding happens lazily against context.
    const unsubscribe = registry.subscribe(currentAtom, (next) => setValue(() => next), {
      immediate: true,
    });

    onCleanup(unsubscribe);
  });

  return value;
}

function useBoundAtomSetter<R, W, Mode extends "value" | "promise" | "promiseExit" = never>(
  atom: Accessor<Atom.Writable<R, W>>,
  options?: {
    readonly mode?: Mode | undefined;
  },
) {
  const registry = useContext(RegistryContext);

  if (options?.mode === "promise" || options?.mode === "promiseExit") {
    return ((value?: W) => {
      const currentAtom = atom();
      registry.set(currentAtom, value as W);
      // Promise modes intentionally wait for the same atom to settle after the
      // write, skipping intermediate waiting states so callers can `await` the
      // final success/failure of that mutation.
      const promise = Effect.runPromiseExit(
        AtomRegistry.getResult(
          registry,
          currentAtom as Atom.Atom<AsyncResult.AsyncResult<any, any>>,
          {
            suspendOnWaiting: true,
          },
        ),
      );

      return options.mode === "promise" ? promise.then(flattenExit) : promise;
    }) as any;
  }

  return ((value?: W) => {
    const currentAtom = atom();
    registry.set(currentAtom, value as W);
  }) as any;
}

function flattenExit<A, E>(exit: Exit.Exit<A, E>): A {
  if (Exit.isSuccess(exit)) return exit.value;
  throw Cause.squash(exit.cause);
}
