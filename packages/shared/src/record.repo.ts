import { Query } from "effect-qb";
import { RecordFilter } from "./record/filter";
import { Array, Effect, Layer, Option, Schema, Context, Stream } from "effect";
import { DB } from "./db.service";
import { RecordSchema } from "./record.schema";
import { Tables } from "./db.tables";
import type { PaneSchema } from "./record/pane.schema";
import { StreamSettings } from "./record/stream-settings";
import { nanoid } from "nanoid";
import { EffectOption } from "./effect/effect-option";
import { AttrsSchema } from "./attrs.schema";
import type * as Sqlite from "effect-qb/sqlite";

type QueryError = Sqlite.Executor.SqliteExecutorError | Sqlite.Errors.SqliteReadQueryError;

export class Service extends Context.Service<Service>()("RecordRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const create = Effect.fn("RecordRepo.create")(function* (
      values: RecordSchema.Create,
    ): Effect.fn.Return<RecordSchema.Record, QueryError | Schema.SchemaError | DB.NotFoundError> {
      const id = yield* Schema.decodeEffect(RecordSchema.Id)(values.id ?? nanoid());

      return yield* db
        .find(
          Query.insert(Tables.records).pipe(
            Query.from(
              DB.values(Tables.records, {
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

    const updateById = Effect.fn("RecordRepo.updateById")(function* (
      id: string,
      values: RecordSchema.Update,
    ): Effect.fn.Return<RecordSchema.Record, QueryError | Schema.SchemaError | DB.NotFoundError> {
      return yield* db
        .find(
          Query.update(Tables.records, values).pipe(
            Query.where(Query.eq(Tables.records.id, id)),
            Query.returning(recordColumns),
          ),
        )
        .pipe(EffectOption.getOrEffect(() => new DB.NotFoundError()));
    });

    const updateAttrs = Effect.fn("RecordRepo.updateAttrs")(function* (opts: {
      readonly id: RecordSchema.Id;
      readonly columns: AttrsColumns;
    }) {
      yield* db.execute(
        Query.update(Tables.records, opts.columns).pipe(
          Query.where(Query.eq(Tables.records.id, opts.id)),
        ),
      );
    });

    const findById = Effect.fn("RecordRepo.findById")(function* (
      id: string,
    ): Effect.fn.Return<Option.Option<RecordSchema.Record>, QueryError> {
      return yield* db.find(
        Query.select(recordColumns).pipe(
          Query.from(Tables.records),
          Query.where(Query.eq(Tables.records.id, id)),
        ),
      );
    });

    const findIdByTitle = Effect.fn("RecordRepo.findIdByTitle")(function* (title: string) {
      return yield* db.find(
        Query.select({ id: Tables.records.id }).pipe(
          Query.from(Tables.records),
          Query.where(Query.eq(Tables.records.title, title)),
          Query.orderBy(Tables.records.createdAt, "asc"),
          Query.orderBy(Tables.records.id, "asc"),
          Query.limit(1),
        ),
      );
    });

    const getById = Effect.fn("RecordRepo.getById")(function* (id: string) {
      return yield* findById(id).pipe(EffectOption.getOrEffect(() => new DB.NotFoundError()));
    });

    // Previews of outgoing [[link]] targets prime the record cache. They are optional:
    // a failed preview query must not prevent loading the record itself.
    const findOutgoingBacklinkPreviews = Effect.fn("RecordRepo.findOutgoingBacklinkPreviews")(
      function* (id: string) {
        return yield* db
          .query(
            Query.select({
              id: Tables.records.id,
              title: Tables.records.title,
              text: Tables.records.text,
              date: Tables.records.date,
              createdAt: Tables.records.createdAt,
              updatedAt: Tables.records.updatedAt,
            }).pipe(
              Query.from(Tables.records),
              Query.innerJoin(
                Tables.backlinks,
                Query.eq(Tables.records.id, Tables.backlinks.targetId),
              ),
              Query.where(Query.eq(Tables.backlinks.sourceId, id)),
            ),
          )
          .pipe(Effect.orElseSucceed(() => []));
      },
    );

    const findByIdWithBacklinks = Effect.fn("RecordRepo.findByIdWithBacklinks")(function* (
      id: string,
    ) {
      return yield* Effect.zipWith(
        findById(id),
        findOutgoingBacklinkPreviews(id),
        (record, backlinks) => {
          return record.pipe(
            Option.flatMap((record) => Option.some<RecordWithBacklinks>({ record, backlinks })),
          );
        },
        { concurrent: true },
      );
    });

    const findBootById = Effect.fn("RecordRepo.findBootById")(function* (id: string) {
      return yield* Effect.zipWith(
        db.find(
          Query.select({
            materializedYUpdate: Tables.records.materializedYUpdate,
            lastEventLocalSeq: Tables.records.lastEventLocalSeq,
          }).pipe(Query.from(Tables.records), Query.where(Query.eq(Tables.records.id, id))),
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

    const findAllNotes = Effect.fn("RecordRepo.findAllNotes")(function* (): Effect.fn.Return<
      ReadonlyArray<RecordSchema.Record>,
      QueryError
    > {
      return yield* db.query(
        Query.select(recordColumns).pipe(
          Query.from(Tables.records),
          Query.where(Query.eq(Tables.records._tag, "note")),
        ),
      );
    });

    const reactiveNotes = Effect.fn("RecordRepo.reactiveNotes")(function* (): Effect.fn.Return<
      Stream.Stream<ReadonlyArray<RecordSchema.Record>, QueryError>
    > {
      return yield* db.reactiveQuery(
        Query.select(recordColumns).pipe(
          Query.from(Tables.records),
          Query.where(Query.eq(Tables.records._tag, "note")),
        ),
      );
    });

    const reactiveStreamList = Effect.fn("RecordRepo.reactiveStreamList")(function* (
      query: StreamListQuery,
    ) {
      const plan = Query.select(streamColumns).pipe(
        Query.from(Tables.records),
        Query.where(RecordFilter.filterPredicate(query)),
      );

      const ordered =
        query.sort === "date"
          ? plan.pipe(
              Query.orderBy(Tables.records.date, "desc"),
              Query.orderBy(Tables.records.createdAt, "desc"),
            )
          : plan.pipe(Query.orderBy(Tables.records.updatedAt, "desc"));

      const stream = yield* db.reactiveQuery(ordered);

      return stream;
    });

    const reactiveFindPreviewById = Effect.fn("RecordRepo.reactiveFindPreviewById")(
      function* (opts: { readonly id: string; readonly filter?: StreamSettings.Filter }) {
        const plan = Query.select(previewColumns).pipe(
          Query.from(Tables.records),
          Query.where(Query.eq(Tables.records.id, opts.id)),
        );

        const filtered =
          opts.filter === undefined
            ? plan
            : plan.pipe(
                Query.where(
                  RecordFilter.filterPredicate({
                    ...opts.filter,
                    props: StreamSettings.propFilters(opts.filter),
                    sort: "updated",
                  }),
                ),
              );

        const stream = yield* db.reactiveQuery(filtered.pipe(Query.limit(1)));

        return stream.pipe(Stream.map(Array.head));
      },
    );

    const reactiveSearchPreview = Effect.fn("RecordRepo.reactiveSearch")(function* (
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
        Query.from(Tables.records),
        Query.where(RecordFilter.filterPredicate(query)),
        Query.where(Query.neq(Tables.records.text, "")),
      );

      const searched =
        trimmed.length === 0
          ? plan
          : plan.pipe(
              Query.where(
                Query.or(
                  Query.like(Tables.records.title, `%${trimmed}%`),
                  Query.like(Tables.records.text, `%${trimmed}%`),
                ),
              ),
              Query.orderBy(
                Query.case()
                  .when(Query.like(Tables.records.title, `%${trimmed}%`), 0)
                  .else(1),
              ),
            );

      const stream = yield* db.reactiveQuery(
        searched.pipe(Query.orderBy(Tables.records.createdAt, "desc"), Query.limit(100)),
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
      findAllNotes,
      reactiveNotes,
      reactiveStreamList,
      reactiveFindPreviewById,
      reactiveSearchPreview,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export type AttrsColumns = Pick<
  Tables.Record,
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

export type RecordWithBacklinks = {
  readonly record: RecordSchema.Record;
  /** Previews of the record's outgoing [[link]] targets. */
  readonly backlinks: ReadonlyArray<RecordSchema.Preview>;
};

export type BootResult = {
  readonly record: RecordSchema.BootRecord;
  /** Previews of the record's outgoing [[link]] targets, for priming the record cache. */
  readonly backlinks: ReadonlyArray<RecordSchema.Preview>;
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
  readonly props?: Readonly<Record<RecordSchema.Id, AttrsSchema.PropVal>>;
  readonly sort: "date" | "updated";
};

const recordColumns = {
  id: Tables.records.id,
  title: Tables.records.title,
  content: Tables.records.content,
  text: Tables.records.text,
  date: Tables.records.date,
  materializedYUpdate: Tables.records.materializedYUpdate,
  createdAt: Tables.records.createdAt,
  updatedAt: Tables.records.updatedAt,
  lastEventLocalSeq: Tables.records.lastEventLocalSeq,
};

// Ordering/grouping metadata only — content and Yjs blobs would make every
// reactive re-query heavy and are served per record instead.
const streamColumns = {
  id: Tables.records.id,
  date: Tables.records.date,
  createdAt: Tables.records.createdAt,
  updatedAt: Tables.records.updatedAt,
} as const;

const previewColumns = {
  id: Tables.records.id,
  title: Tables.records.title,
  text: Tables.records.text,
  date: Tables.records.date,
  createdAt: Tables.records.createdAt,
  updatedAt: Tables.records.updatedAt,
};

export * as RecordRepo from "./record.repo";
