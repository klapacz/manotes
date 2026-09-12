import { Context, Effect, Layer, Schema, Stream, SubscriptionRef } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";
import * as SqliteClient from "@effect/sql-sqlite-bun/SqliteClient";
import * as CliConfig from "../../web/src/cli/cli.config";
import * as CliDatabase from "../../web/src/cli/cli.database";
import * as CliPaths from "../../web/src/cli/cli.paths";
import * as CliSync from "../../web/src/cli/cli.sync";
import * as CliUrl from "../../web/src/cli/url";
import * as DB from "../../web/src/lib/db.service";
import * as EventRepo from "../../web/src/lib/event.repo";
import * as GraphSync from "../../web/src/lib/graph-sync/service";
import * as GraphSyncStatus from "../../web/src/lib/graph-sync/status";
import * as Materializer from "../../web/src/lib/materializer.service";
import * as NoteSchema from "../../web/src/lib/note.schema";
import { fromNote } from "./tasks";

export const make = Effect.gen(function* () {
  const config = yield* CliConfig.Service;
  const sql = yield* SqlClient.SqlClient;
  const sync = yield* GraphSync.Service;
  const materializer = yield* Materializer.Service;
  const status = yield* GraphSyncStatus.Ref;

  const query = SqlSchema.findAll({
    Request: Schema.Void,
    Result: Schema.Struct({
      id: Schema.String,
      title: Schema.NullOr(Schema.String),
      content: NoteSchema.Content,
    }),
    execute: () => sql`SELECT id, title, content FROM notes WHERE id LIKE 'task:%'`,
  });

  return {
    graphUrl: CliUrl.make(config),
    tasks: sql.reactive(["notes"], query()).pipe(Stream.map((notes) => notes.map(fromNote))),
    status: SubscriptionRef.changes(status),
    start: Effect.all([sync.start(), materializer.start()], {
      concurrency: "unbounded",
      discard: true,
    }),
    open: (id: string) => CliUrl.open(CliUrl.make(config, id)),
  };
});

export class Service extends Context.Service<Service, Effect.Success<typeof make>>()(
  "TasksBackend.Service",
) {}

const sqlLayer = Layer.effect(
  SqlClient.SqlClient,
  Effect.gen(function* () {
    const config = yield* DB.Config;

    return yield* SqliteClient.make({ filename: config.databasePath });
  }),
);

const database = CliDatabase.layer.pipe(Layer.provideMerge(sqlLayer));

export const layer = Layer.mergeAll(
  CliSync.layer,
  Materializer.Service.layer,
  EventRepo.Service.layer,
).pipe(
  Layer.provideMerge(database),
  Layer.provideMerge(CliConfig.layerFromFile),
  Layer.provideMerge(CliPaths.layer),
);
