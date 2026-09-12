/**
 * Supervises the client graph sync session and retries after disconnects.
 */
import {
  Cause,
  Effect,
  Layer,
  Option,
  Schedule,
  Context,
  SubscriptionRef,
  Predicate,
} from "effect";
import * as EventRepo from "../event.repo";
import * as GraphSyncEventLog from "./event-log.service";
import * as Session from "./machine/session";
import * as Status from "./status";
import { SyncStatusCloud } from "../graph.worker-rpc";

export class Service extends Context.Service<Service>()("GraphSyncService", {
  make: Effect.gen(function* () {
    const status = yield* Status.Ref;

    const run = Effect.fn("GraphSyncService.run")(function* () {
      return yield* Session.run().pipe(
        Effect.tapCause(
          Effect.fn(function* (cause) {
            const syncState = Option.match(Cause.findErrorOption(cause), {
              onNone: () => "Disconnected" as const,
              onSome: (error) => {
                if (
                  Predicate.isTagged(error, "SocketError") &&
                  Predicate.isTagged(error.reason, "SocketOpenError")
                ) {
                  return "Failed" as const;
                }

                return "Disconnected" as const;
              },
            });

            yield* Effect.logWarning(`Graph sync ${syncState}`, cause);
            yield* SubscriptionRef.update(
              status,
              (prev) =>
                new SyncStatusCloud({
                  mode: prev.mode,
                  hasPending: prev.hasPending,
                  syncState,
                }),
            );
          }),
        ),
      );
    });

    const start = Effect.fn("GraphSyncService.start")(function* () {
      return yield* run().pipe(
        Effect.retry(
          Schedule.exponential("250 millis").pipe(Schedule.either(Schedule.spaced("1 minute"))),
        ),
      );
    });

    return { run, start };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(EventRepo.Service.layer),
    Layer.provide(GraphSyncEventLog.Service.layer),
  );
}
