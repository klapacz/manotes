import { fileURLToPath } from "node:url";
import { Effect, FileSystem, Path, Schema } from "effect";

const Entry = Schema.Struct({
  origin: Schema.String,
  sessionToken: Schema.RedactedFromValue(Schema.String),
  graphId: Schema.String,
  graphName: Schema.String,
  graphPassword: Schema.RedactedFromValue(Schema.String),
  caCertificate: Schema.optionalKey(Schema.String),
});

export type Entry = typeof Entry.Type;

const Json = Schema.fromJsonString(Entry);

const encode = Schema.encodeEffect(Json);

const decode = Schema.decodeEffect(Json);

export const Id = Schema.String.check(Schema.isUUID(4));

const directory = fileURLToPath(new URL("../.dev/entries/", import.meta.url));

export const read = Effect.fn("DevEntry.read")(function* (id: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;

  return yield* fs.readFileString(path.join(directory, `${id}.json`)).pipe(
    Effect.flatMap(decode),
    Effect.mapError(() => new Error("Cannot read browser entry. Run dev --seed-type demo again.")),
  );
});

export const write = Effect.fn("DevEntry.write")(function* (id: string, entry: Entry) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const ca = process.env.NODE_EXTRA_CA_CERTS;

  const json = yield* encode({
    ...entry,
    caCertificate: ca ? yield* fs.readFileString(ca) : undefined,
  });

  yield* fs.makeDirectory(directory, { recursive: true, mode: 0o700 });
  yield* fs.writeFileString(path.join(directory, `${id}.json`), json, { mode: 0o600 });
});

export * as DevEntry from "./dev-entry.ts";
