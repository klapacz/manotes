import { createEffect, onCleanup } from "solid-js";
import { Effect, Fiber, ManagedRuntime, Stream } from "effect";
import { createStore, reconcile } from "solid-js/store";

export function createStreamStore<A extends object, E, R, RE>(
  opts: () => {
    runtime: ManagedRuntime.ManagedRuntime<R, RE>;
    stream: Stream.Stream<A, E, R>;
  },
  staticInitialValue: NoInfer<A>,
) {
  const [store, setStore] = createStore<A>(staticInitialValue);

  createEffect(() => {
    const { runtime, stream } = opts();
    const fiber = stream.pipe(
      Stream.runForEach((a) => Effect.sync(() => setStore(reconcile(a)))),
      runtime.runFork,
    );

    onCleanup(async () => {
      await runtime.runPromise(Fiber.interrupt(fiber));
    });
  });

  return store;
}
