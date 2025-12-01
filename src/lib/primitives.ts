import { onCleanup } from "solid-js";
import { Effect, Fiber, ManagedRuntime, Stream } from "effect";
import { createStore, reconcile } from "solid-js/store";

export function createStreamStore<A extends object, E, R>(
  runtime: ManagedRuntime.ManagedRuntime<R, never>,
  stream: Stream.Stream<A, E, R>,
  initialValue: NoInfer<A>,
) {
  const [store, setStore] = createStore<A>(initialValue);

  const fiber = stream.pipe(
    Stream.runForEach((a) => Effect.sync(() => setStore(reconcile(a)))),
    runtime.runFork,
  );

  onCleanup(async () => {
    await runtime.runPromise(Fiber.interrupt(fiber));
  });

  return store;
}
