/**
 * Supervises the client graph sync session and retries after disconnects.
 */
import { Effect, Schedule } from "effect";
import * as DB from "../db.service";
import * as EventRepo from "../event.repo";
import * as GraphSyncEventLog from "./event-log.service";
import * as Session from "./machine/session";

export class Service extends Effect.Service<Service>()("GraphSyncService", {
  dependencies: [
    DB.Service.Default,
    EventRepo.Service.Default,
    GraphSyncEventLog.Service.Default,
  ],
  effect: Effect.succeed({
    start: Effect.fn("GraphSyncService.start")(function* () {
      return yield* Session.run().pipe(
        Effect.tapErrorCause((cause) =>
          Effect.logWarning("Graph sync socket closed", cause),
        ),
        Effect.retry(
          Schedule.exponential("250 millis").pipe(
            Schedule.union(Schedule.spaced("5 seconds")),
          ),
        ),
      );
    }),
  }),
}) {}
