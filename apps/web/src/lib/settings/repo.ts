import { Effect, Option, Redacted, Schema, Stream } from "effect";
import { SqlClient, SqlSchema } from "effect/unstable/sql";

const read = SqlSchema.findOneOption({
  Request: Schema.Void,
  Result: Schema.Struct({ openaiApiKey: Schema.NullOr(Schema.String) }),
  execute: () =>
    SqlClient.SqlClient.use((sql) => sql`SELECT openaiApiKey FROM settings WHERE id = 1`),
});

export const getOpenAIKey = read(undefined).pipe(
  Effect.map((row) => Option.flatMap(row, (value) => Option.fromNullishOr(value.openaiApiKey))),
  Effect.map(Option.map(Redacted.make)),
  Effect.withTracerEnabled(false),
);

export const setOpenAIKey = (key: string) =>
  SqlClient.SqlClient.use(
    (sql) => sql`
    INSERT INTO settings (id, openaiApiKey) VALUES (1, ${key.trim() || null})
    ON CONFLICT(id) DO UPDATE SET openaiApiKey = excluded.openaiApiKey
  `,
  ).pipe(Effect.asVoid, Effect.withTracerEnabled(false));

export const watchOpenAIKey = SqlClient.SqlClient.use((sql) =>
  Effect.succeed(sql.reactive(["settings"], getOpenAIKey)),
).pipe(Stream.unwrap);

export * as SettingsRepo from "./repo";
