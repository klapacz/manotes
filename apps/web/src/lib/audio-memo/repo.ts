import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { type Array, DateTime, Effect, Option, Schema, Stream, Types } from "effect";
import { DB } from "@manotes/shared/db.service";
import { Tables } from "../db.tables";
import { AudioMemoIntent } from "./intent";

type RawRecord = typeof Tables.recordings.$inferSelect;

export type Record = Types.MergeRight<
  RawRecord,
  { recordedAt: DateTime.Utc; intent: AudioMemoIntent.Record }
>;

export type Filter = {
  path?: string;
  state?: Array.NonEmptyReadonlyArray<Record["state"]>;
};

export const list = Effect.fn("AudioMemoRepo.list")(function* (
  filter: Filter,
  order: "asc" | "desc",
) {
  const db = yield* DB.Service;

  const rows = yield* db.query((db) =>
    db.select().from(Tables.recordings).where(where(filter)).orderBy(orderBy(order)),
  );

  return yield* Effect.forEach(rows, (row) => decode(row));
});

export const listReactive = (filter: Filter, order: "asc" | "desc") =>
  DB.Service.use((db) =>
    db.reactiveQuery((db) =>
      db.select().from(Tables.recordings).where(where(filter)).orderBy(orderBy(order)),
    ),
  ).pipe(
    Stream.unwrap,
    Stream.mapEffect((rows) => Effect.forEach(rows, (row) => decode(row))),
  );

export const get = Effect.fn("AudioMemoRepo.get")(function* (path: string) {
  const db = yield* DB.Service;

  const row = yield* db.find((db) =>
    db.select().from(Tables.recordings).where(eq(Tables.recordings.path, path)),
  );

  if (Option.isNone(row)) return yield* new DB.NotFoundError();

  return yield* decode(row.value);
});

export const insert = Effect.fn("AudioMemoRepo.insert")(function* (recording: Record) {
  const db = yield* DB.Service;
  const intent = yield* AudioMemoIntent.encode(recording.intent);
  yield* db.query((db) =>
    db
      .insert(Tables.recordings)
      .values({ ...recording, intent, recordedAt: DateTime.formatIso(recording.recordedAt) })
      .onConflictDoNothing()
      .returning(),
  );
});

export const update = Effect.fn("AudioMemoRepo.update")(function* (
  filter: Filter,
  values: Partial<Omit<Record, "path">>,
) {
  const db = yield* DB.Service;

  const encoded = {
    ...values,
    intent: values.intent === undefined ? undefined : yield* AudioMemoIntent.encode(values.intent),
    recordedAt: values.recordedAt === undefined ? undefined : DateTime.formatIso(values.recordedAt),
  };

  yield* db.query((db) =>
    db.update(Tables.recordings).set(encoded).where(where(filter)).returning(),
  );
});

export const remove = Effect.fn("AudioMemoRepo.remove")(function* (path: string) {
  const db = yield* DB.Service;
  yield* db.query((db) =>
    db.delete(Tables.recordings).where(eq(Tables.recordings.path, path)).returning(),
  );
});

function where(filter: Filter) {
  return and(
    filter.path === undefined ? undefined : eq(Tables.recordings.path, filter.path),
    filter.state === undefined ? undefined : inArray(Tables.recordings.state, [...filter.state]),
  );
}

function orderBy(order: "asc" | "desc") {
  return order === "asc" ? asc(Tables.recordings.recordedAt) : desc(Tables.recordings.recordedAt);
}

const decodeRecordedAt = Schema.decodeEffect(Schema.DateTimeUtcFromString);

const decode = Effect.fn("AudioMemoRepo.decode")(function* (row: RawRecord) {
  return {
    ...row,
    recordedAt: yield* decodeRecordedAt(row.recordedAt),
    intent: yield* AudioMemoIntent.decode(row.intent),
  };
});

export * as AudioMemoRepo from "./repo";
