import { Data, DateTime, Effect, Layer } from "effect";
import { BuiltinAttrs } from "@manotes/shared/builtin-attrs.service";
import { EventRepo } from "@manotes/shared/event.repo";
import type * as BackupSchema from "@manotes/shared/graph-backup/schema";
import * as Materializer from "@manotes/shared/materializer.service";
import { GraphDatabase } from "./database";

export class InitializationError extends Data.TaggedError("GraphInitializationError")<{
  readonly cause: unknown;
}> {}

export const initialize = Effect.fn("GraphInitialize.initialize")(function* (opts: {
  readonly localGraphId: string;
  readonly createdAt: DateTime.Utc;
  readonly events?: BackupSchema.Bundle["events"];
}) {
  yield* Effect.gen(function* () {
    if (opts.events !== undefined) {
      const events = yield* EventRepo.Service;
      yield* events.importBackupEvents(opts.events);
    }

    const builtins = yield* BuiltinAttrs.Service;
    yield* builtins.ensureArchived({ createdAt: opts.createdAt });
    const materializer = yield* Materializer.Service;
    yield* materializer.catchUp();
  }).pipe(
    Effect.provide(
      Layer.mergeAll(
        EventRepo.Service.layer,
        BuiltinAttrs.Service.layer,
        Materializer.Service.layer,
      ).pipe(Layer.provideMerge(GraphDatabase.layer({ localGraphId: opts.localGraphId }))),
    ),
    Effect.mapError((cause) => new InitializationError({ cause })),
  );
}, Effect.scoped);

export * as GraphInitialize from "./initialize";
