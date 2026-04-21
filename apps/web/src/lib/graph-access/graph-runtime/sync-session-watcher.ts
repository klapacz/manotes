import { Context, Effect, Layer, Schedule, Stream } from "effect";
import * as GraphWorkerClient from "../../graph-worker.client";
import * as SessionService from "../session/service";

export class Service extends Context.Service<Service>()(
  "GraphAccess.GraphRuntime.SyncSessionWatcher",
  {
    make: Effect.gen(function* () {
      const worker = yield* GraphWorkerClient.Service;
      const session = yield* SessionService.Service;

      const watchLoop = Effect.gen(function* () {
        yield* worker.client.syncStatusStream({}).pipe(
          Stream.tap(
            Effect.fn(function* (s) {
              if (s.mode === "cloud" && s.syncState === "Failed") {
                yield* Effect.log("Sync failed, refreshing session");
                yield* session.refresh;
              }
            }),
          ),
          Stream.runDrain,
        );
      }).pipe(Effect.retry({ schedule: Schedule.spaced("5 seconds") }));

      yield* watchLoop.pipe(
        Effect.catchCause((cause) => Effect.logError("Sync session watcher gave up", cause)),
        Effect.forkScoped,
      );

      return {};
    }),
  },
) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(GraphWorkerClient.Service.layer),
  );
}
