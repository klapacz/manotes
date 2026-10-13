import { Query } from "effect-qb";
import { type Array, DateTime, Effect, Schema, Stream, Types } from "effect";
import { DB } from "@manotes/shared/db.service";
import { EffectOption } from "@manotes/shared/effect/effect-option";
import { Tables } from "../db.tables";
import { AudioMemoIntent } from "./intent";

export type Record = Types.MergeRight<
  Tables.Recording,
  { recordedAt: DateTime.Utc; intent: AudioMemoIntent.Record }
>;

export type Filter = { path?: string; state?: Array.NonEmptyReadonlyArray<Record["state"]> };

export const list = Effect.fn("AudioMemoRepo.list")(function* (
  filter: Filter,
  order: "asc" | "desc",
) {
  const db = yield* DB.Service;
  const rows = yield* db.query(select(filter, order));

  return yield* Effect.forEach(rows, (row) => decode(row));
});

export const listReactive = (filter: Filter, order: "asc" | "desc") => {
  return DB.Service.use((db) => db.reactiveQuery(select(filter, order))).pipe(
    Stream.unwrap,
    Stream.mapEffect((rows) => Effect.forEach(rows, (row) => decode(row))),
  );
};

export const get = Effect.fn("AudioMemoRepo.get")(function* (path: string) {
  const db = yield* DB.Service;

  return yield* db
    .find(
      Query.select(Tables.recordings.columns).pipe(
        Query.from(Tables.recordings),
        Query.where(Query.eq(Tables.recordings.path, path)),
      ),
    )
    .pipe(EffectOption.traverseOrElse(decode, () => new DB.NotFoundError()));
});

export const insert = Effect.fn("AudioMemoRepo.insert")(function* (recording: Record) {
  const db = yield* DB.Service;
  const intent = yield* AudioMemoIntent.encode(recording.intent);
  yield* db.query(
    Query.insert(Tables.recordings, {
      ...recording,
      intent,
      recordedAt: DateTime.formatIso(recording.recordedAt),
    }).pipe(Query.onConflict("path"), Query.returning(Tables.recordings.columns)),
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

  yield* db.query(
    Query.update(Tables.recordings, encoded).pipe(
      Query.where(where(filter)),
      Query.returning(Tables.recordings.columns),
    ),
  );
});

export const remove = Effect.fn("AudioMemoRepo.remove")(function* (path: string) {
  const db = yield* DB.Service;
  yield* db.query(
    Query.delete(Tables.recordings).pipe(
      Query.where(Query.eq(Tables.recordings.path, path)),
      Query.returning(Tables.recordings.columns),
    ),
  );
});

const decodeRecordedAt = Schema.decodeEffect(Schema.DateTimeUtcFromString);

const decode = Effect.fn("AudioMemoRepo.decode")(function* (row: Tables.Recording) {
  return {
    ...row,
    recordedAt: yield* decodeRecordedAt(row.recordedAt),
    intent: yield* AudioMemoIntent.decode(row.intent),
  };
});

function select(filter: Filter, order: "asc" | "desc") {
  return Query.select(Tables.recordings.columns).pipe(
    Query.from(Tables.recordings),
    Query.where(where(filter)),
    Query.orderBy(Tables.recordings.recordedAt, order),
  );
}

function where(filter: Filter) {
  return Query.andAll([
    ...(filter.path === undefined ? [] : [Query.eq(Tables.recordings.path, filter.path)]),
    ...(filter.state === undefined ? [] : [Query.in(Tables.recordings.state, ...filter.state)]),
  ]);
}

export * as AudioMemoRepo from "./repo";
