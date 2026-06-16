import { Array, Effect, flow, Layer, Option, pipe, Schema, Context, Stream } from "effect";
import * as DB from "./db.service";
import * as NoteEmbeddingSchema from "./note-embedding.schema";
import * as NoteEmbeddingService from "./note-embedding.service";
import * as NoteSchema from "./note.schema";
import * as Tables from "./db.tables";
import { and, desc, eq, isNotNull, isNull, like, ne, or, sql, type SQL } from "drizzle-orm";
import { nanoid } from "nanoid";
import { LibOption } from "./effect/option";

const SEMANTIC_RESULT_LIMIT = 50;

const decodeRecord = Schema.decodeEffect(NoteSchema.Record);
const decodePreview = Schema.decodeEffect(NoteSchema.Preview);
const decodePreviewArray = Schema.decodeEffect(Schema.Array(NoteSchema.Preview));
const decodeMetaArray = Schema.decodeEffect(Schema.Array(NoteSchema.Meta));
const decodeBootRecord = Schema.decodeEffect(NoteSchema.BootRecord);
const decodeEmbeddingStats = Schema.decodeEffect(NoteEmbeddingSchema.Stats);

export class Service extends Context.Service<Service>()("NoteRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const create = Effect.fn("NoteRepo.create")(function* (note: typeof NoteSchema.Create.Type) {
      const encoded = yield* pipe(note, Schema.encodeEffect(NoteSchema.Create));

      const id = encoded.id ?? nanoid();

      const record = yield* db.find((db) =>
        db
          .insert(Tables.notes)
          .values({
            id,
            title: encoded.title,
            content: encoded.content,
            text: encoded.text,
            date: encoded.date,
            materializedYUpdate: encoded.materializedYUpdate ?? null,
            createdAt: encoded.createdAt,
            updatedAt: encoded.updatedAt,
            lastEventLocalSeq: encoded.lastEventLocalSeq ?? 0,
          })
          .returning(),
      );

      return yield* Option.match(record, {
        onNone: () => new DB.NotFoundError(),
        onSome: decodeRecord,
      });
    });

    const updateById = Effect.fn("NoteRepo.updateById")(function* (
      id: string,
      updates: typeof NoteSchema.Update.Type,
    ) {
      const encoded = yield* pipe(updates, Schema.encodeEffect(NoteSchema.Update));

      const record = yield* db.find((db) =>
        db.update(Tables.notes).set(encoded).where(eq(Tables.notes.id, id)).returning(),
      );

      return yield* Option.match(record, {
        onNone: () => new DB.NotFoundError(),
        onSome: decodeRecord,
      });
    });

    const findById = Effect.fn("NoteRepo.findById")(function* (id: string) {
      const record = yield* db.find((db) =>
        db.select().from(Tables.notes).where(eq(Tables.notes.id, id)),
      );

      if (Option.isNone(record)) return Option.none();

      return yield* decodeRecord(record.value).pipe(Effect.asSome);
    });

    const getById = Effect.fn("NoteRepo.getById")(function* (id: string) {
      const note = yield* findById(id);

      if (Option.isNone(note)) return yield* new DB.NotFoundError();

      return note.value;
    });

    const findBootById = Effect.fn("NoteRepo.findBootById")(function* (id: string) {
      const [record, backlinks] = yield* Effect.all(
        [
          db
            .find((db) =>
              db
                .select({
                  materializedYUpdate: Tables.notes.materializedYUpdate,
                  lastEventLocalSeq: Tables.notes.lastEventLocalSeq,
                })
                .from(Tables.notes)
                .where(eq(Tables.notes.id, id)),
            )
            .pipe(Effect.flatMap(LibOption.mapEffect(decodeBootRecord))),
          // Previews of the note's outgoing [[link]] targets, for priming
          // the note cache; a paint nicety — failures fall back to empty
          // instead of failing the boot.
          db
            .query((db) =>
              db
                .select({
                  id: Tables.notes.id,
                  title: Tables.notes.title,
                  text: Tables.notes.text,
                  date: Tables.notes.date,
                  createdAt: Tables.notes.createdAt,
                  updatedAt: Tables.notes.updatedAt,
                })
                .from(Tables.backlinks)
                .innerJoin(Tables.notes, eq(Tables.notes.id, Tables.backlinks.targetId))
                .where(eq(Tables.backlinks.sourceId, id)),
            )
            .pipe(
              Effect.flatMap(decodePreviewArray),
              Effect.orElseSucceed(() => []),
            ),
        ],
        { concurrency: "unbounded" },
      );

      if (Option.isNone(record)) return Option.none();

      return Option.some<BootResult>({ record: record.value, backlinks });
    });

    const reactiveStreamList = Effect.fn("NoteRepo.reactiveStreamList")(function* (
      query: StreamListQuery,
    ) {
      const stream = yield* db.reactiveQuery((db) => {
        const conditions = streamFilterConditions(query);
        // Within a date, newest-created first — createdAt keeps positions
        // stable across edits, unlike updatedAt.
        const orderBy =
          query.sort === "date"
            ? [desc(Tables.notes.date), desc(Tables.notes.createdAt)]
            : [desc(Tables.notes.updatedAt)];

        if (query.relatedTo !== undefined) {
          if (query.backlinksTo === undefined) {
            return db
              .select({
                ...streamColumns,
                embedding: Tables.noteEmbeddings.embedding,
              })
              .from(Tables.notes)
              .innerJoin(Tables.noteEmbeddings, eq(Tables.noteEmbeddings.noteId, Tables.notes.id))
              .where(
                and(...conditions, eq(Tables.noteEmbeddings.model, NoteEmbeddingService.MODEL_ID)),
              )
              .orderBy(...orderBy);
          }

          return db
            .select({
              ...streamColumns,
              embedding: Tables.noteEmbeddings.embedding,
            })
            .from(Tables.notes)
            .innerJoin(Tables.noteEmbeddings, eq(Tables.noteEmbeddings.noteId, Tables.notes.id))
            .innerJoin(Tables.backlinks, eq(Tables.backlinks.sourceId, Tables.notes.id))
            .where(
              and(
                ...conditions,
                eq(Tables.noteEmbeddings.model, NoteEmbeddingService.MODEL_ID),
                eq(Tables.backlinks.targetId, query.backlinksTo),
              ),
            )
            .orderBy(...orderBy);
        }

        if (query.backlinksTo === undefined) {
          return db
            .select(streamColumns)
            .from(Tables.notes)
            .where(and(...conditions))
            .orderBy(...orderBy);
        }

        return db
          .select(streamColumns)
          .from(Tables.notes)
          .innerJoin(Tables.backlinks, eq(Tables.backlinks.sourceId, Tables.notes.id))
          .where(and(...conditions, eq(Tables.backlinks.targetId, query.backlinksTo)))
          .orderBy(...orderBy);
      });

      if (query.relatedTo !== undefined) {
        return stream.pipe(
          Stream.mapEffect((rows) =>
            decodeMetaArray(
              rankSemanticRows(query.relatedTo!, rows as ReadonlyArray<SemanticStreamRow>),
            ),
          ),
        );
      }

      return stream.pipe(Stream.mapEffect((n) => decodeMetaArray(n)));
    });

    const reactiveFindPreviewById = Effect.fn("NoteRepo.reactiveFindPreviewById")(function* (
      id: string,
    ) {
      const stream = yield* db.reactiveQuery((db) =>
        db
          .select({
            id: Tables.notes.id,
            title: Tables.notes.title,
            text: Tables.notes.text,
            date: Tables.notes.date,
            createdAt: Tables.notes.createdAt,
            updatedAt: Tables.notes.updatedAt,
          })
          .from(Tables.notes)
          .where(eq(Tables.notes.id, id)),
      );

      return stream.pipe(
        Stream.mapEffect(
          flow(
            Array.head,
            Option.match({
              onNone: () => Effect.succeedNone,
              onSome: flow(decodePreview, Effect.asSome),
            }),
          ),
        ),
      );
    });

    const reactiveSearchPreview = Effect.fn("NoteRepo.reactiveSearch")(function* (filter: string) {
      const stream = yield* db.reactiveQuery((db) => {
        const trimmed = filter.trim();
        const where = and(
          ne(Tables.notes.text, ""),
          trimmed.length > 0
            ? or(like(Tables.notes.title, `%${trimmed}%`), like(Tables.notes.text, `%${trimmed}%`))
            : undefined,
        );

        return db
          .select({
            id: Tables.notes.id,
            title: Tables.notes.title,
            text: Tables.notes.text,
            date: Tables.notes.date,
            createdAt: Tables.notes.createdAt,
            updatedAt: Tables.notes.updatedAt,
          })
          .from(Tables.notes)
          .limit(100)
          .where(where)
          .orderBy(
            // Prefer title matches over body-only matches for non-empty searches,
            // then keep the result order deterministic by creation time.
            trimmed.length > 0
              ? sql`CASE WHEN ${Tables.notes.title} LIKE ${`%${trimmed}%`} THEN 0 ELSE 1 END`
              : sql`0`,
            desc(Tables.notes.createdAt),
          );
      });

      return stream.pipe(Stream.mapEffect((rows) => decodePreviewArray(rows)));
    });

    const reactiveEmbeddingStats = Effect.fn("NoteRepo.reactiveEmbeddingStats")(function* (
      query: StreamListQuery,
    ) {
      const stream = yield* db.reactiveQuery((db) => {
        const conditions = [...streamFilterConditions(query), ne(Tables.notes.text, "")];
        const select = {
          id: Tables.notes.id,
          embeddingNoteId: Tables.noteEmbeddings.noteId,
        };

        const joinCondition = and(
          eq(Tables.noteEmbeddings.noteId, Tables.notes.id),
          eq(Tables.noteEmbeddings.model, NoteEmbeddingService.MODEL_ID),
          eq(Tables.noteEmbeddings.dimensions, NoteEmbeddingService.DIMENSIONS),
        );

        if (query.backlinksTo === undefined) {
          return db
            .select(select)
            .from(Tables.notes)
            .leftJoin(Tables.noteEmbeddings, joinCondition)
            .where(and(...conditions));
        }

        return db
          .select(select)
          .from(Tables.notes)
          .innerJoin(Tables.backlinks, eq(Tables.backlinks.sourceId, Tables.notes.id))
          .leftJoin(Tables.noteEmbeddings, joinCondition)
          .where(and(...conditions, eq(Tables.backlinks.targetId, query.backlinksTo)));
      });

      return stream.pipe(
        Stream.mapEffect((rows) => decodeEmbeddingStats(buildEmbeddingStats(query, rows))),
      );
    });

    return {
      create,
      updateById,
      findById,
      getById,
      findBootById,
      reactiveStreamList,
      reactiveFindPreviewById,
      reactiveSearchPreview,
      reactiveEmbeddingStats,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export type BootResult = {
  readonly record: NoteSchema.BootRecord;
  /** Previews of the note's outgoing [[link]] targets, for priming the note cache. */
  readonly backlinks: ReadonlyArray<typeof NoteSchema.Preview.Type>;
};

export const bootResultEmpty = (): BootResult => ({
  record: {
    lastEventLocalSeq: 0,
    materializedYUpdate: null,
  },
  backlinks: [],
});

export type StreamListQuery = {
  readonly type?: "all" | "notes" | "pages";
  readonly date?: string;
  readonly backlinksTo?: string;
  readonly relatedTo?: string;
  readonly sort: "date" | "updated";
};

// Ordering/grouping metadata only — content and Yjs blobs would make every
// reactive re-query heavy and are served per note instead.
const streamColumns = {
  id: Tables.notes.id,
  date: Tables.notes.date,
  updatedAt: Tables.notes.updatedAt,
} as const;

function streamFilterConditions(query: StreamListQuery): Array<SQL> {
  const conditions: Array<SQL> = [];

  if (query.type === "pages") conditions.push(isNotNull(Tables.notes.title));
  if (query.type === "notes") conditions.push(isNull(Tables.notes.title));

  if (query.date) conditions.push(eq(Tables.notes.date, query.date));

  return conditions;
}

type SemanticStreamRow = typeof NoteSchema.Meta.Encoded & {
  readonly embedding: VectorBlob;
};

type EmbeddingStatsNoteRow = {
  readonly id: string;
  readonly embeddingNoteId: string | null;
};

function buildEmbeddingStats(query: StreamListQuery, rows: ReadonlyArray<EmbeddingStatsNoteRow>) {
  const candidates =
    query.relatedTo === undefined ? rows : rows.filter((row) => row.id !== query.relatedTo);
  const target =
    query.relatedTo === undefined ? undefined : rows.find((row) => row.id === query.relatedTo);

  return {
    model: NoteEmbeddingService.MODEL_ID,
    dimensions: NoteEmbeddingService.DIMENSIONS,
    total: candidates.length,
    embedded: candidates.filter((row) => row.embeddingNoteId !== null).length,
    targetEmbedded:
      query.relatedTo === undefined
        ? null
        : target !== undefined && target.embeddingNoteId !== null
          ? 1
          : 0,
  };
}

function rankSemanticRows(
  targetId: string,
  rows: ReadonlyArray<SemanticStreamRow>,
): ReadonlyArray<typeof NoteSchema.Meta.Encoded> {
  const target = pipe(
    Array.findFirst(rows, (row) => row.id === targetId),
    Option.flatMap((row) => decodeVector(row.embedding)),
  );

  if (Option.isNone(target)) return [];

  return rows
    .filter((row) => row.id !== targetId)
    .flatMap((row) =>
      Option.match(decodeVector(row.embedding), {
        onNone: () => [],
        onSome: (embedding) => [
          {
            id: row.id,
            date: row.date,
            updatedAt: row.updatedAt,
            score: dotProduct(target.value, embedding),
          },
        ],
      }),
    )
    .sort((left, right) => right.score - left.score)
    .slice(0, SEMANTIC_RESULT_LIMIT)
    .map(({ id, date, updatedAt }) => ({ id, date, updatedAt }));
}

type VectorBlob = Uint8Array<ArrayBufferLike> | ArrayBuffer;

function decodeVector(blob: VectorBlob | null): Option.Option<Float32Array> {
  const bytes = toVectorBytes(blob);
  if (Option.isNone(bytes)) return Option.none();

  const byteLength = NoteEmbeddingService.DIMENSIONS * Float32Array.BYTES_PER_ELEMENT;
  if (bytes.value.byteLength !== byteLength) return Option.none();

  const buffer = bytes.value.buffer.slice(
    bytes.value.byteOffset,
    bytes.value.byteOffset + bytes.value.byteLength,
  );
  return Option.some(new Float32Array(buffer));
}

function toVectorBytes(blob: VectorBlob | null): Option.Option<Uint8Array<ArrayBufferLike>> {
  if (blob === null) return Option.none();
  if (blob instanceof Uint8Array) return Option.some(blob);
  if (blob instanceof ArrayBuffer) return Option.some(new Uint8Array(blob));

  return Option.none();
}

function dotProduct(left: Float32Array, right: Float32Array): number {
  let score = 0;

  for (let index = 0; index < left.length; index++) {
    score += left[index]! * right[index]!;
  }

  return score;
}
