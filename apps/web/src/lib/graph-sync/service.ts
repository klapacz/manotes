/**
 * Supervises the client graph sync session and retries after disconnects.
 */
import { Effect, Layer, Schedule, Context, SubscriptionRef } from "effect";
import * as EventRepo from "../event.repo";
import * as GraphSyncEventLog from "./event-log.service";
import * as Session from "./machine/session";
import * as Status from "./status";
import { SyncStatusCloud } from "../graph.worker-rpc";

export class Service extends Context.Service<Service>()("GraphSyncService", {
  make: Effect.gen(function* () {
    const status = yield* Status.Ref;

    return {
      start: Effect.fn("GraphSyncService.start")(function* () {
        return yield* Session.run().pipe(
          Effect.tapCause(
            Effect.fn(function* (cause) {
              yield* Effect.logWarning("Graph sync socket closed", cause);
              yield* SubscriptionRef.update(
                status,
                (prev) =>
                  new SyncStatusCloud({
                    mode: prev.mode,
                    hasPending: prev.hasPending,
                    syncState: "Disconnected" as const,
                  }),
              );
            }),
          ),
          Effect.retry(
            Schedule.exponential("250 millis").pipe(Schedule.either(Schedule.spaced("1 minute"))),
          ),
        );
      }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(EventRepo.Service.layer),
    Layer.provide(GraphSyncEventLog.Service.layer),
  );
}
