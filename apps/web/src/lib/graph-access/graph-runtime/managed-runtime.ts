import { Effect, Exit, Fiber, Layer, Scope } from "effect";
import { Atom } from "effect/unstable/reactivity";

export interface ManagedRuntime<R, ER> {
  readonly scope: Scope.Closeable;
  readonly memoMap: Layer.MemoMap;
  readonly atom: Atom.AtomRuntime<R, ER>;
  readonly runFork: <A, E>(
    effect: Effect.Effect<A, E, R>,
    options?: Effect.RunOptions,
  ) => Fiber.Fiber<A, E | ER>;
  readonly runSyncExit: <A, E>(effect: Effect.Effect<A, E, R>) => Exit.Exit<A, E | ER>;
  readonly runSync: <A, E>(effect: Effect.Effect<A, E, R>) => A;
  readonly runPromiseExit: <A, E>(
    effect: Effect.Effect<A, E, R>,
    options?: Effect.RunOptions,
  ) => Promise<Exit.Exit<A, E | ER>>;
  readonly runPromise: <A, E>(
    effect: Effect.Effect<A, E, R>,
    options?: Effect.RunOptions,
  ) => Promise<A>;
  readonly dispose: Effect.Effect<void>;
}

export const createScoped = Effect.fn("GraphAccessGraphRuntimeManagedRuntime.createScoped")(
  function* <R, ER>(layer: Layer.Layer<R, ER, never>) {
    const scope = yield* Scope.make();
    const memoMap = yield* Layer.makeMemoMap;
    const services = yield* Layer.buildWithMemoMap(layer, memoMap, scope);
    const atom = Atom.context({ memoMap })(layer);

    const provide = <A, E>(effect: Effect.Effect<A, E, R>) =>
      Effect.provideContext(effect, services);

    const runtime: ManagedRuntime<R, ER> = {
      scope,
      memoMap,
      atom,
      runFork: (effect, options) => Effect.runFork(provide(effect), options),
      runSyncExit: (effect) => Effect.runSyncExit(provide(effect)),
      runSync: (effect) => Effect.runSync(provide(effect)),
      runPromiseExit: (effect, options) => Effect.runPromiseExit(provide(effect), options),
      runPromise: (effect, options) => Effect.runPromise(provide(effect), options),
      dispose: Scope.close(scope, Exit.void),
    };

    return runtime;
  },
);
