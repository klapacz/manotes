import { Effect, Fiber, FiberMap, Layer, Option, Semaphore, Stream, SubscriptionRef } from "effect";
import { GraphAccessLocalRegistryLayer } from "../graph-access/local-registry/layer";
import { SettingsRepo } from "../settings/repo";
import { AudioMemoRepo } from "./repo";
import { AudioMemoService } from "./service";

export const make = Effect.fn("AudioMemoWorker.make")(function* () {
  const registry = yield* Layer.build(GraphAccessLocalRegistryLayer.Layer);
  const jobs = yield* FiberMap.make<string>();
  const serial = yield* Semaphore.make(1);
  const active = yield* SubscriptionRef.make<string | null>(null);

  yield* Stream.zipLatest(
    AudioMemoRepo.listReactive({ state: "pending" }, "asc"),
    SettingsRepo.watchOpenAIKey.pipe(Stream.provideContext(registry)),
  ).pipe(
    Stream.runForEach(([recordings, key]) => {
      if (Option.isNone(key)) return Effect.void;

      return Effect.forEach(
        recordings,
        ({ path }) => {
          const job = Effect.acquireUseRelease(
            SubscriptionRef.set(active, path),
            () => AudioMemoService.transcribe(path, key.value),
            () => SubscriptionRef.set(active, null),
          ).pipe(Semaphore.withPermit(serial));

          return FiberMap.run(jobs, path, job, { onlyIfMissing: true });
        },
        { discard: true },
      );
    }),
    Effect.forkScoped,
  );

  return {
    statusStream: SubscriptionRef.changes(active),
    remove: Effect.fn("AudioMemoWorker.remove")(function* (path: string) {
      const job = AudioMemoService.remove(path).pipe(
        Semaphore.withPermit(serial),
        Effect.mapError(() => "Could not remove this recording."),
      );

      // Replacing the matching job interrupts transcription and releases its
      // permit. Keep this key occupied until removal finishes.
      const removal = yield* FiberMap.run(jobs, path, job);

      yield* Fiber.join(removal);
    }),
  };
});

export * as AudioMemoWorker from "./worker";
