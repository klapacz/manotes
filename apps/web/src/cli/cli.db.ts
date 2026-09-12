import { Effect, Layer } from "effect";
import { SqlClient } from "effect/unstable/sql";
import * as SqliteClient from "@effect/sql-sqlite-node/SqliteClient";
import * as DB from "../lib/db.service";
import * as CliDatabase from "./cli.database";

const layerSQL = Layer.effect(
  SqlClient.SqlClient,
  Effect.gen(function* () {
    const config = yield* DB.Config;

    return yield* SqliteClient.make({ filename: config.databasePath });
  }),
);

export const layer = CliDatabase.layer.pipe(Layer.provideMerge(layerSQL));

export * as CliDB from "./cli.db";
