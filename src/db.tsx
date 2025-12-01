import { Effect, Data, Schema, pipe, DateTime, Context, Option } from "effect";
import type { NodeJSON } from "prosekit/core";
import { SQLocal, type Transaction } from "sqlocal";

class MigrationError extends Data.TaggedError("MigrationError")<{
  cause: unknown;
}> {}

class DBError extends Data.TaggedError("DbError")<{ cause: unknown }> {}

class DBClient extends Effect.Service<DBClient>()("DBClient", {
  effect: Effect.gen(function* () {
    return yield* Effect.succeed(new SQLocal("database.sqlite3"));
  }),
}) {}

class DBTransaction extends Context.Tag("DBTX")<DBTransaction, Transaction>() {}

const getClientOrTransaction = pipe(
  Effect.serviceOption(DBTransaction),
  Effect.flatMap((tx) =>
    Effect.gen(function* () {
      if (Option.isSome(tx)) {
        return tx.value;
      }

      return yield* DBClient;
    }),
  ),
);

class DB extends Effect.Service<DB>()("DB", {
  dependencies: [DBClient.Default],
  effect: Effect.gen(function* () {
    const transaction = Effect.fn("DB.Transaction")(function* <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) {
      const tx = yield* Effect.serviceOption(DBTransaction);

      if (Option.isSome(tx)) {
        return yield* effect.pipe(
          Effect.provideService(DBTransaction, tx.value),
        );
      }

      const client = yield* DBClient;

      const acquire = Effect.tryPromise({
        try: () => client.beginTransaction(),
        catch: (cause) => new DBError({ cause }),
      });

      return yield* Effect.acquireUseRelease(
        acquire,
        (tx) => effect.pipe(Effect.provideService(DBTransaction, tx)),
        (tx) => Effect.promise(() => tx.commit()),
      );
    });

    const run = Effect.fn("DB.try")(function* <T>(
      promise: (clientOrTransaction: SQLocal | Transaction) => PromiseLike<T>,
    ) {
      const clientOrTransaction = yield* getClientOrTransaction;

      return yield* Effect.tryPromise({
        try: () => promise(clientOrTransaction),
        catch: (cause) => new DBError({ cause }),
      });
    });

    yield* run(
      (client) => client.sql`
        CREATE TABLE IF NOT EXISTS notes (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          content JSON NOT NULL,
          createdAt DATETIME NOT NULL,
          updatedAt DATETIME NOT NULL
        );

        CREATE TABLE IF NOT EXISTS events (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          type TEXT NOT NULL,
          payload BLOB NOT NULL,
          timestamp DATETIME NOT NULL
        );
      `,
    ).pipe(
      Effect.mapError((error) => new MigrationError({ cause: error.cause })),
    );

    return {
      transaction,
      run,
    };
  }),
}) {}

// =============
// Event schemas
// =============

const EventTypeSchema = Schema.Literal("create", "update");

// TODO: use lib0 encoding/decoding
const Uint8ArraySchema = Schema.transform(
  Schema.String,
  Schema.declare<Uint8Array<ArrayBuffer>>(
    (x): x is Uint8Array<ArrayBuffer> => x instanceof Uint8Array,
  ),
  {
    encode: (array) => new TextDecoder().decode(array),
    decode: (string) => new TextEncoder().encode(string),
    strict: true,
  },
);

const EventSchema = Schema.Struct({
  id: Schema.Number,
  type: EventTypeSchema,
  payload: Uint8ArraySchema,
  timestamp: Schema.DateTimeUtc,
});

const EventCreateSchema = EventSchema.omit("id");

// ==========
// Event repo
// ==========

class EventRepo extends Effect.Service<EventRepo>()("EventRepo", {
  effect: Effect.gen(function* () {
    const db = yield* DB;

    const create = Effect.fn("EventRepo.create")(function* (
      event: typeof EventCreateSchema.Type,
    ) {
      const encoded = yield* pipe(
        event,
        Schema.encodeOption(EventCreateSchema),
      );

      const records = yield* db.run(
        (client) => client.sql`
          INSERT INTO
            events (type, payload, timestamp)
          VALUES
            (${encoded.type}, ${encoded.payload}, ${encoded.timestamp})
          RETURNING *;
        `,
      );

      return yield* pipe(records[0], Schema.decodeUnknown(EventSchema));
    });

    return {
      create,
    };
  }),
}) {}

const program = Effect.gen(function* () {
  const eventRepo = yield* EventRepo;

  const returned = yield* eventRepo.create({
    type: "create",
    payload: new Uint8Array([1, 2, 3]),
    timestamp: yield* DateTime.now,
  });

  yield* Effect.log({ returned });
});

Effect.runCallback(
  pipe(
    program,
    Effect.provide(EventRepo.Default),
    Effect.provide(DB.Default),
    Effect.provide(DBClient.Default),
  ),
  {
    onExit: (exit) => {
      console.log("Program exited:", exit);
    },
  },
);

// ===========
// Note schema
// ===========

const NoteContentSchema = Schema.declare<NodeJSON>(
  (_x): _x is NodeJSON => true,
);

const NoteSchema = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  content: NoteContentSchema,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
});
