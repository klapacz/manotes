import { Query } from "effect-qb";
import { NoteFilter } from "./note/filter";
import { Array, Effect, Layer, Option, Schema, Context, Stream } from "effect";
import { DB } from "./db.service";
import { NoteSchema } from "./note.schema";
import { Tables } from "./db.tables";
import type { PaneSchema } from "./note/pane.schema";
import { StreamSettings } from "./note/stream-settings";
import { nanoid } from "nanoid";
import { EffectOption } from "./effect/effect-option";
import { AttrsSchema } from "./attrs.schema";
import type * as Sqlite from "effect-qb/sqlite";

type QueryError = Sqlite.Executor.SqliteExecutorError | Sqlite.Errors.SqliteReadQueryError;

export class Service extends Context.Service<Service>()("NoteRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const create = Effect.fn("NoteRepo.create")(function* (
      values: NoteSchema.Create,
    ): Effect.fn.Return<NoteSchema.Record, QueryError | Schema.SchemaError | DB.NotFoundError> {
      const id = yield* Schema.decodeEffect(NoteSchema.Id)(values.id ?? nanoid());

      return yield* db
        .find(
          Query.insert(Tables.notes).pipe(
            Query.from(
              DB.values(Tables.notes, {
                id,
                title: values.title,
                content: values.content,
                text: values.text,
                date: values.date,
                materializedYUpdate: values.materializedYUpdate ?? null,
                createdAt: values.createdAt,
                updatedAt: values.updatedAt,
                lastEventLocalSeq: values.lastEventLocalSeq ?? 0,
              }),
            ),
            Query.returning(recordColumns),
          ),
        )
        .pipe(EffectOption.getOrEffect(() => new DB.NotFoundError()));
    });

    const updateById = Effect.fn("NoteRepo.updateById")(function* (
      id: string,
      values: NoteSchema.Update,
    ): Effect.fn.Return<NoteSchema.Record, QueryError | Schema.SchemaError | DB.NotFoundError> {
      return yield* db
        .find(
          Query.update(Tables.notes, values).pipe(
            Query.where(Query.eq(Tables.notes.id, id)),
            Query.returning(recordColumns),
          ),
        )
        .pipe(EffectOption.getOrEffect(() => new DB.NotFoundError()));
    });

    const updateAttrs = Effect.fn("NoteRepo.updateAttrs")(function* (opts: {
      readonly id: NoteSchema.Id;
      readonly columns: AttrsColumns;
    }) {
      yield* db.execute(
        Query.update(Tables.notes, opts.columns).pipe(
          Query.where(Query.eq(Tables.notes.id, opts.id)),
        ),
      );
    });

    const findById = Effect.fn("NoteRepo.findById")(function* (
      id: string,
    ): Effect.fn.Return<Option.Option<NoteSchema.Record>, QueryError> {
      return yield* db.find(
        Query.select(recordColumns).pipe(
          Query.from(Tables.notes),
          Query.where(Query.eq(Tables.notes.id, id)),
        ),
      );
    });

    const findIdByTitle = Effect.fn("NoteRepo.findIdByTitle")(function* (title: string) {
      return yield* db.find(
        Query.select({ id: Tables.notes.id }).pipe(
          Query.from(Tables.notes),
          Query.where(Query.eq(Tables.notes.title, title)),
          Query.orderBy(Tables.notes.createdAt, "asc"),
          Query.orderBy(Tables.notes.id, "asc"),
          Query.limit(1),
        ),
      );
    });

    const getById = Effect.fn("NoteRepo.getById")(function* (id: string) {
      return yield* findById(id).pipe(EffectOption.getOrEffect(() => new DB.NotFoundError()));
    });

    // Previews of outgoing [[link]] targets prime the note cache. They are optional:
    // a failed preview query must not prevent loading the note itself.
    const findOutgoingBacklinkPreviews = Effect.fn("NoteRepo.findOutgoingBacklinkPreviews")(
      function* (id: string) {
        return yield* db
          .query(
            Query.select({
              id: Tables.notes.id,
              title: Tables.notes.title,
              text: Tables.notes.text,
              date: Tables.notes.date,
              createdAt: Tables.notes.createdAt,
              updatedAt: Tables.notes.updatedAt,
            }).pipe(
              Query.from(Tables.notes),
              Query.innerJoin(
                Tables.backlinks,
                Query.eq(Tables.notes.id, Tables.backlinks.targetId),
              ),
              Query.where(Query.eq(Tables.backlinks.sourceId, id)),
            ),
          )
          .pipe(Effect.orElseSucceed(() => []));
      },
    );

    const findByIdWithBacklinks = Effect.fn("NoteRepo.findByIdWithBacklinks")(function* (
      id: string,
    ) {
      return yield* Effect.zipWith(
        findById(id),
        findOutgoingBacklinkPreviews(id),
        (record, backlinks) => {
          return record.pipe(
            Option.flatMap((record) => Option.some<NoteWithBacklinks>({ record, backlinks })),
          );
        },
        { concurrent: true },
      );
    });

    const findBootById = Effect.fn("NoteRepo.findBootById")(function* (id: string) {
      return yield* Effect.zipWith(
        db.find(
          Query.select({
            materializedYUpdate: Tables.notes.materializedYUpdate,
            lastEventLocalSeq: Tables.notes.lastEventLocalSeq,
          }).pipe(Query.from(Tables.notes), Query.where(Query.eq(Tables.notes.id, id))),
        ),
        findOutgoingBacklinkPreviews(id),
        (record, backlinks) => {
          return record.pipe(
            Option.flatMap((record) => Option.some<BootResult>({ record, backlinks })),
          );
        },
        { concurrent: true },
      );
    });

    const findAllRecords = Effect.fn("NoteRepo.findAllRecords")(function* (): Effect.fn.Return<
      ReadonlyArray<NoteSchema.Record>,
      QueryError
    > {
      return yield* db.query(
        Query.select(recordColumns).pipe(
          Query.from(Tables.notes),
          Query.where(Query.eq(Tables.notes._tag, "note")),
        ),
      );
    });

    const reactiveStreamRecords = Effect.fn("NoteRepo.reactiveStreamRecords")(
      function* (): Effect.fn.Return<Stream.Stream<ReadonlyArray<NoteSchema.Record>, QueryError>> {
        return yield* db.reactiveQuery(
          Query.select(recordColumns).pipe(
            Query.from(Tables.notes),
            Query.where(Query.eq(Tables.notes._tag, "note")),
          ),
        );
      },
    );

    const reactiveStreamList = Effect.fn("NoteRepo.reactiveStreamList")(function* (
      query: StreamListQuery,
    ) {
      const plan = Query.select(streamColumns).pipe(
        Query.from(Tables.notes),
        Query.where(NoteFilter.filterPredicate(query)),
      );

      const ordered =
        query.sort === "date"
          ? plan.pipe(
              Query.orderBy(Tables.notes.date, "desc"),
              Query.orderBy(Tables.notes.createdAt, "desc"),
            )
          : plan.pipe(Query.orderBy(Tables.notes.updatedAt, "desc"));

      const stream = yield* db.reactiveQuery(ordered);

      return stream;
    });

    const reactiveFindPreviewById = Effect.fn("NoteRepo.reactiveFindPreviewById")(function* (opts: {
      readonly id: string;
      readonly filter?: StreamSettings.Filter;
    }) {
      const plan = Query.select(previewColumns).pipe(
        Query.from(Tables.notes),
        Query.where(Query.eq(Tables.notes.id, opts.id)),
      );

      const filtered =
        opts.filter === undefined
          ? plan
          : plan.pipe(
              Query.where(
                NoteFilter.filterPredicate({
                  ...opts.filter,
                  props: StreamSettings.propFilters(opts.filter),
                  sort: "updated",
                }),
              ),
            );

      const stream = yield* db.reactiveQuery(filtered.pipe(Query.limit(1)));

      return stream.pipe(Stream.map(Array.head));
    });

    const reactiveSearchPreview = Effect.fn("NoteRepo.reactiveSearch")(function* (
      opts: SearchPreviewQuery,
    ) {
      const trimmed = opts.search.trim();

      const query =
        opts.filter === undefined
          ? { sort: "updated" as const }
          : {
              ...opts.filter,
              props: StreamSettings.propFilters(opts.filter),
              sort: "updated" as const,
            };

      const plan = Query.select(previewColumns).pipe(
        Query.from(Tables.notes),
        Query.where(NoteFilter.filterPredicate(query)),
        Query.where(Query.neq(Tables.notes.text, "")),
      );

      const searched =
        trimmed.length === 0
          ? plan
          : plan.pipe(
              Query.where(
                Query.or(
                  Query.like(Tables.notes.title, `%${trimmed}%`),
                  Query.like(Tables.notes.text, `%${trimmed}%`),
                ),
              ),
              Query.orderBy(
                Query.case()
                  .when(Query.like(Tables.notes.title, `%${trimmed}%`), 0)
                  .else(1),
              ),
            );

      const stream = yield* db.reactiveQuery(
        searched.pipe(Query.orderBy(Tables.notes.createdAt, "desc"), Query.limit(100)),
      );

      return stream;
    });

    return {
      create,
      updateById,
      updateAttrs,
      findById,
      findIdByTitle,
      getById,
      findByIdWithBacklinks,
      findBootById,
      findAllRecords,
      reactiveStreamRecords,
      reactiveStreamList,
      reactiveFindPreviewById,
      reactiveSearchPreview,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export type AttrsColumns = Pick<
  Tables.Note,
  | "_tag"
  | "prop_type"
  | "prop_default"
  | "prop_targets"
  | "owned_type"
  | "owned_parent"
  | "rule_storage"
  | "rule_targets"
  | "attrs_valid"
>;

export type NoteWithBacklinks = {
  readonly record: NoteSchema.Record;
  /** Previews of the note's outgoing [[link]] targets. */
  readonly backlinks: ReadonlyArray<NoteSchema.Preview>;
};

export type BootResult = {
  readonly record: NoteSchema.BootRecord;
  /** Previews of the note's outgoing [[link]] targets, for priming the note cache. */
  readonly backlinks: ReadonlyArray<NoteSchema.Preview>;
};

export const bootResultEmpty = (): BootResult => ({
  record: {
    lastEventLocalSeq: 0,
    materializedYUpdate: null,
  },
  backlinks: [],
});

export type SearchPreviewQuery = {
  readonly search: string;
  readonly filter?: StreamSettings.Filter;
};

export type StreamListQuery = {
  readonly type?: PaneSchema.StreamFilterType;
  readonly date?: string;
  readonly backlinksTo?: string;
  readonly linksFrom?: string;
  readonly search?: string;
  readonly props?: Readonly<Record<NoteSchema.Id, AttrsSchema.PropVal>>;
  readonly sort: "date" | "updated";
};

const recordColumns = {
  id: Tables.notes.id,
  title: Tables.notes.title,
  content: Tables.notes.content,
  text: Tables.notes.text,
  date: Tables.notes.date,
  materializedYUpdate: Tables.notes.materializedYUpdate,
  createdAt: Tables.notes.createdAt,
  updatedAt: Tables.notes.updatedAt,
  lastEventLocalSeq: Tables.notes.lastEventLocalSeq,
};

// Ordering/grouping metadata only — content and Yjs blobs would make every
// reactive re-query heavy and are served per note instead.
const streamColumns = {
  id: Tables.notes.id,
  date: Tables.notes.date,
  createdAt: Tables.notes.createdAt,
  updatedAt: Tables.notes.updatedAt,
} as const;

const previewColumns = {
  id: Tables.notes.id,
  title: Tables.notes.title,
  text: Tables.notes.text,
  date: Tables.notes.date,
  createdAt: Tables.notes.createdAt,
  updatedAt: Tables.notes.updatedAt,
};

export * as NoteRepo from "./note.repo";
