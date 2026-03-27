/**
 * Supervises the client graph sync session and retries after disconnects.
 */
import { Effect, Ref, Schedule } from "effect";
import * as EventRepo from "../event.repo";
import * as GraphSyncEventLog from "./event-log.service";
import * as Session from "./machine/session";
import * as Status from "./status";
import { SyncStatusCloud } from "../graph.worker-rpc";

export class Service extends Effect.Service<Service>()("GraphSyncService", {
  dependencies: [EventRepo.Service.Default, GraphSyncEventLog.Service.Default],
  effect: Effect.gen(function* () {
    const status = yield* Status.Ref;

    return {
      start: Effect.fn("GraphSyncService.start")(function* () {
        return yield* Session.run().pipe(
          Effect.tapErrorCause(
            Effect.fn(function* (cause) {
              yield* Effect.logWarning("Graph sync socket closed", cause);
              yield* Ref.update(
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
            Schedule.exponential("250 millis").pipe(Schedule.union(Schedule.spaced("5 seconds"))),
          ),
        );
      }),
    };
  }),
}) {}
