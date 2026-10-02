// Adapted from solidjs/solid `next` branch, examples/effect/src/solid-effect.ts
// (fetched 2026-10-02), written for Effect 3 and Solid 2.0 RC.
// Copied because it is an example, not a published package.
// Modifications: ported to Effect 4 (an Effect is its own `yield*` step, no
// YieldWrap); runtimes are any `runFork`/`runPromise` pair so the graph's
// custom runtime fits; added `runStream`, `createStreamStore`, `runScoped` and
// `createEffectCommand` (non-transactional commands with settled state).
import { Cause, Effect, Exit, Fiber, Scope, Stream } from "effect";
import {
  action,
  createContext,
  createEffect,
  createSignal,
  createStore,
  reconcile,
  onCleanup,
  useContext,
  type Accessor,
} from "solid-js";

type NoFn<T> = T extends Function ? never : T;

/** The part of a ManagedRuntime the bridge needs. */
export interface Runtime<R> {
  readonly runFork: <A, E>(effect: Effect.Effect<A, E, R>) => Fiber.Fiber<A, unknown>;
  readonly runPromise: <A, E>(effect: Effect.Effect<A, E, R>) => Promise<A>;
}

/** The runtime for the current subtree: global graph access at the root, the
 * open graph's runtime under `$graph`. */
export const RuntimeContext = createContext<Runtime<any> | null>(null);

/** Resolve the nearest runtime; call under an owner (component or computation). */
export function useRuntime<R = any>(): Runtime<R> {
  const runtime = useContext(RuntimeContext);

  if (!runtime) throw new Error("useRuntime requires a RuntimeContext");

  return runtime;
}

const DONE = { done: true, value: undefined } as const;

/** An Effect as a Solid async source. Superseding or disposing the reading
 * computation closes the iterator, which interrupts the fiber. */
export function runEffect<A, E, R>(
  effect: Effect.Effect<A, E, R>,
  runtime: Runtime<R> = useRuntime(),
): AsyncIterable<A> {
  return {
    [Symbol.asyncIterator]() {
      const fiber = runtime.runFork(effect);
      let yielded = false;
      let closed = false;

      return {
        async next(): Promise<IteratorResult<A>> {
          if (yielded || closed) return DONE;

          const exit = await Effect.runPromise(Fiber.await(fiber));

          if (closed) return DONE;

          if (Exit.isSuccess(exit)) {
            yielded = true;

            return { done: false, value: exit.value };
          }

          closed = true;

          if (Cause.hasInterruptsOnly(exit.cause)) return DONE;

          throw Cause.squash(exit.cause);
        },
        async return(): Promise<IteratorResult<A>> {
          if (!yielded && !closed) Effect.runFork(Fiber.interrupt(fiber));

          closed = true;

          return DONE;
        },
      };
    },
  };
}

/** A Stream as a Solid async source; each element is a new value. */
export function runStream<A, E, R>(
  stream: Stream.Stream<A, E, R>,
  runtime: Runtime<R> = useRuntime(),
): AsyncIterable<A> {
  return {
    [Symbol.asyncIterator]() {
      // The runtime's services are captured asynchronously; the global runtime
      // may still be building its layer.
      const iterator = runtime
        .runPromise(Stream.toAsyncIterableEffect(stream))
        .then((iterable) => iterable[Symbol.asyncIterator]());

      let closed = false;

      return {
        async next(): Promise<IteratorResult<A>> {
          const current = await iterator;

          return closed ? DONE : current.next();
        },
        async return(): Promise<IteratorResult<A>> {
          closed = true;
          const current = await iterator.catch(() => undefined);
          await current?.return?.();

          return DONE;
        },
      };
    },
  };
}

/** A live Stream mirrored into a store: input changes resubscribe, and the
 * previous value stays until the new stream emits, so readers (handlers,
 * focus state) never see a pending read. Elements reconcile by `id`. */
export function createStreamStore<T extends object, E, R>(
  source: () => Stream.Stream<T, E, R>,
  seed: T,
  runtime: Runtime<R> = useRuntime(),
): T {
  // SAFETY: stream states are plain data; T only excludes functions at the type level.
  const [store, setStore] = createStore<T>(seed as NoFn<T>);

  createEffect(source, (stream) => {
    const iterator = runStream(stream, runtime)[Symbol.asyncIterator]();
    let active = true;

    void (async () => {
      for (;;) {
        const step = await iterator.next();

        if (step.done || !active) return;

        const value = step.value;
        setStore(reconcile(value));
      }
    })();

    return () => {
      active = false;
      void iterator.return?.();
    };
  });

  return store;
}

/** Acquire a scoped resource for the current owner's lifetime. The value is a
 * Solid async source; the scope closes when the owner is disposed. */
export function runScoped<A, E, R>(
  effect: Effect.Effect<A, E, R | Scope.Scope>,
  runtime: Runtime<R> = useRuntime(),
): Promise<A> {
  const scope = Scope.makeUnsafe();
  onCleanup(() => void Effect.runFork(Scope.close(scope, Exit.void)));

  return runtime.runPromise(Scope.provide(effect, scope));
}

/** Thrown into a saga when its in-flight step is interrupted. */
export class ActionInterruptedError extends Error {
  constructor() {
    super("Action interrupted");
    this.name = "ActionInterruptedError";
  }
}

export interface EffectAction<Args extends unknown[], A> {
  (...args: Args): Promise<A>;
  /** Interrupt the in-flight step; the saga sees `ActionInterruptedError`. */
  interrupt(): void;
}

/** A Solid action written as an Effect saga: each `yield*`-ed Effect is one
 * transaction step, run as an interruptible fiber. A new invocation
 * interrupts the previous one's in-flight step. */
export function effectAction<Args extends unknown[], A, R>(
  saga: (...args: Args) => Generator<Effect.Effect<any, any, R>, A, any>,
  runtime: Runtime<R> = useRuntime(),
): EffectAction<Args, A> {
  let inFlight: Fiber.Fiber<any, any> | null = null;

  const base = action(function* (...args: Args) {
    const steps = saga(...args);
    let step = steps.next();

    while (!step.done) {
      const fiber = runtime.runFork(step.value);
      inFlight = fiber;
      const exit: Exit.Exit<unknown, unknown> = yield Effect.runPromise(Fiber.await(fiber));

      if (inFlight === fiber) inFlight = null;

      if (Exit.isSuccess(exit)) step = steps.next(exit.value);
      else if (Cause.hasInterruptsOnly(exit.cause))
        step = steps.throw(new ActionInterruptedError());
      else step = steps.throw(Cause.squash(exit.cause));
    }

    return step.value;
  });

  const invoke = (...args: Args) => {
    invoke.interrupt();

    return base(...args);
  };

  invoke.interrupt = () => {
    const fiber = inFlight;
    inFlight = null;

    if (fiber) Effect.runFork(Fiber.interrupt(fiber));
  };

  return invoke;
}

export interface EffectCommand<Args extends unknown[], A, E> extends EffectAction<Args, A> {
  /** True while an invocation is in flight. */
  readonly pending: Accessor<boolean>;
  /** The last settled invocation, cleared when the next one starts. */
  readonly exit: Accessor<Exit.Exit<A, E> | undefined>;
  /** The last invocation's success value. */
  readonly value: Accessor<A | undefined>;
  /** The last invocation's failure. */
  readonly error: Accessor<unknown>;
}

/** A command for forms and buttons: each call runs as an interruptible fiber
 * and supersedes the previous one. Unlike `effectAction` it opens no
 * transaction, so a slow command does not hold unrelated UI updates. The
 * returned promise rejects with the squashed failure. */
export function createEffectCommand<Args extends unknown[], A, E, R>(
  run: (...args: Args) => Effect.Effect<A, E, R | Scope.Scope>,
  runtime: Runtime<R> = useRuntime(),
): EffectCommand<Args, A, E> {
  // Commands may start from owned scopes, e.g. a dialog's setup.
  const [pending, setPending] = createSignal(false, { ownedWrite: true });

  const [exit, setExit] = createSignal<Exit.Exit<A, E> | undefined>(undefined, {
    ownedWrite: true,
  });

  let inFlight: Fiber.Fiber<A, unknown> | undefined;

  const interrupt = () => {
    const fiber = inFlight;
    inFlight = undefined;

    if (fiber) Effect.runFork(Fiber.interrupt(fiber));
  };

  const invoke = async (...args: Args) => {
    interrupt();
    setExit(undefined);
    setPending(true);

    // Like Atom.fn, a command owns a scope for its resources until it settles.
    const fiber = runtime.runFork(Effect.scoped(run(...args)));
    inFlight = fiber;
    // SAFETY: the fiber runs `run(...)`, so its failures are E or defects.
    const result = (await Effect.runPromise(Fiber.await(fiber))) as Exit.Exit<A, E>;

    if (inFlight === fiber) {
      inFlight = undefined;
      setPending(false);
      setExit(() => result);
    }

    if (Exit.isSuccess(result)) return result.value;

    throw Cause.squash(result.cause);
  };

  return Object.assign(invoke, {
    interrupt,
    pending,
    exit,
    value: () => {
      const current = exit();

      return current && Exit.isSuccess(current) ? current.value : undefined;
    },
    error: () => {
      const current = exit();

      return current && Exit.isFailure(current) ? Cause.squash(current.cause) : undefined;
    },
  });
}
