import { Query } from "effect-qb";
import { RecordFilter } from "./record/filter";
import {
  Array,
  Effect,
  Layer,
  Option,
  Schema,
  Context,
  Stream,
  Struct,
  flow,
  identity,
  type Types,
} from "effect";
import { DB } from "./db.service";
import { RecordSchema } from "./record.schema";
import { Tables } from "./db.tables";
import { nanoid } from "nanoid";
import { EffectOption } from "./effect/effect-option";
import { AttrsSchema } from "./attrs.schema";
import type * as Sqlite from "effect-qb/sqlite";

type QueryError = Sqlite.Executor.SqliteExecutorError | Sqlite.Errors.SqliteReadQueryError;

export const ListOpts = Schema.Struct({
  filter: Schema.optionalKey(AttrsSchema.Filter),
  sort: Schema.optionalKey(Schema.Literals(["date", "updated"])),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
});

export type ListOpts = typeof ListOpts.Type;

export type ListRecord = Types.MergeRight<
  Omit<Tables.Record, "materializedYUpdate" | "lastEventLocalSeq" | "attrs_valid">,
  {
    readonly props: readonly Pick<Tables.Prop, "path" | "propId" | "value">[];
    readonly rule_expects: readonly Pick<Tables.RuleExpect, "propId" | "value">[];
  }
>;

export class Service extends Context.Service<Service>()("RecordRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const create = Effect.fn("RecordRepo.create")(function* (
      values: Create,
    ): Effect.fn.Return<Record, QueryError | Schema.SchemaError | DB.NotFoundError> {
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
      id: RecordSchema.Id,
      values: Update,
    ): Effect.fn.Return<Record, QueryError | Schema.SchemaError | DB.NotFoundError> {
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
      id: RecordSchema.Id,
    ): Effect.fn.Return<Option.Option<Record>, QueryError> {
      return yield* db.find(
        recordSelect.pipe(Query.from(Tables.records), Query.where(Query.eq(Tables.records.id, id))),
      );
    });

    const findIdByTitle = Effect.fn("RecordRepo.findIdByTitle")(function* (title: string) {
      return yield* db.find(
        idSelect.pipe(
          Query.from(Tables.records),
          Query.where(Query.eq(Tables.records.title, title)),
          Query.orderBy(Tables.records.createdAt, "asc"),
          Query.orderBy(Tables.records.id, "asc"),
          Query.limit(1),
        ),
      );
    });

    const getById = Effect.fn("RecordRepo.getById")(function* (id: RecordSchema.Id) {
      return yield* findById(id).pipe(EffectOption.getOrEffect(() => new DB.NotFoundError()));
    });

    // Previews of outgoing [[link]] targets prime the record cache. They are optional:
    // a failed preview query must not prevent loading the record itself.
    const findOutgoingBacklinkPreviews = Effect.fn("RecordRepo.findOutgoingBacklinkPreviews")(
      function* (id: RecordSchema.Id) {
        return yield* db
          .query(
            previewSelect.pipe(
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
      id: RecordSchema.Id,
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

    const findBootById = Effect.fn("RecordRepo.findBootById")(function* (id: RecordSchema.Id) {
      return yield* Effect.zipWith(
        db.find(
          bootSelect.pipe(Query.from(Tables.records), Query.where(Query.eq(Tables.records.id, id))),
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
      ReadonlyArray<Record>,
      QueryError
    > {
      return yield* db.query(
        recordSelect.pipe(
          Query.from(Tables.records),
          Query.where(Query.eq(Tables.records._tag, "note")),
        ),
      );
    });

    const list = Effect.fn("RecordRepo.list")(function* (
      opts: ListOpts = {},
    ): Effect.fn.Return<readonly ListRecord[], QueryError> {
      return yield* Query.select({
        ...Struct.pick(Tables.records, [
          "id",
          "_tag",
          "title",
          "content",
          "text",
          "date",
          "createdAt",
          "updatedAt",
          "prop_type",
          "prop_default",
          "prop_targets",
          "owned_type",
          "owned_parent",
          "rule_storage",
          "rule_targets",
        ]),
        props: db.jsonArrayFrom(
          Query.select(Struct.pick(Tables.props, ["path", "propId", "value"])).pipe(
            Query.from(Tables.props),
            Query.where(Query.eq(Tables.props.recordId, Tables.records.id)),
            Query.orderBy(Tables.props.path),
            Query.orderBy(Tables.props.propId),
          ),
        ),
        rule_expects: db.jsonArrayFrom(
          Query.select(Struct.pick(Tables.ruleExpects, ["propId", "value"])).pipe(
            Query.from(Tables.ruleExpects),
            Query.where(Query.eq(Tables.ruleExpects.ruleId, Tables.records.id)),
            Query.orderBy(Tables.ruleExpects.propId),
          ),
        ),
      }).pipe(
        Query.from(Tables.records),
        Query.where(RecordFilter.filterPredicate(opts.filter ?? [])),
        opts.sort === "updated"
          ? Query.orderBy(Tables.records.updatedAt, "desc")
          : flow(
              Query.orderBy(Tables.records.date, "desc"),
              Query.orderBy(Tables.records.createdAt, "desc"),
            ),
        Query.orderBy(Tables.records.id, "asc"),
        opts.limit === undefined ? identity : Query.limit(opts.limit),
        db.query,
      );
    });

    const listLabels = Effect.fn("RecordRepo.listLabels")(function* (): Effect.fn.Return<
      readonly Pick<Tables.Record, "id" | "title" | "text">[],
      QueryError
    > {
      return yield* Query.select(Struct.pick(Tables.records, ["id", "title", "text"])).pipe(
        Query.from(Tables.records),
        db.query,
      );
    });

    const listIds = Effect.fn("RecordRepo.listIds")(function* (
      filter: AttrsSchema.Filter,
    ): Effect.fn.Return<readonly RecordSchema.Id[], QueryError> {
      return yield* Query.select({ id: Tables.records.id }).pipe(
        Query.from(Tables.records),
        Query.where(RecordFilter.filterPredicate(filter)),
        db.query,
        Effect.map((rows) => Array.map(rows, (row) => row.id)),
      );
    });

    const reactiveNotes = Effect.fn("RecordRepo.reactiveNotes")(function* (): Effect.fn.Return<
      Stream.Stream<ReadonlyArray<Record>, QueryError>
    > {
      return yield* db.reactiveQuery(
        recordSelect.pipe(
          Query.from(Tables.records),
          Query.where(Query.eq(Tables.records._tag, "note")),
        ),
      );
    });

    const reactiveStreamList = Effect.fn("RecordRepo.reactiveStreamList")(function* (
      query: StreamListQuery,
    ) {
      const plan = streamSelect.pipe(
        Query.from(Tables.records),
        Query.where(RecordFilter.filterPredicate(query.filter)),
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

    const reactiveFindPreview = Effect.fn("RecordRepo.reactiveFindPreview")(function* (
      filter: AttrsSchema.Filter,
    ) {
      const stream = yield* db.reactiveQuery(
        previewSelect.pipe(
          Query.from(Tables.records),
          Query.where(RecordFilter.filterPredicate(filter)),
          Query.limit(1),
        ),
      );

      return stream.pipe(Stream.map(Array.head));
    });

    const reactiveSearchPreview = Effect.fn("RecordRepo.reactiveSearchPreview")(function* (
      filter: AttrsSchema.Filter,
    ) {
      return yield* db.reactiveQuery(
        previewSelect.pipe(
          Query.from(Tables.records),
          Query.where(RecordFilter.filterPredicate(filter)),
          Query.where(Query.neq(Tables.records.text, "")),
          Query.orderBy(Query.case().when(RecordFilter.titleMatchPredicate(filter), 0).else(1)),
          Query.orderBy(Tables.records.createdAt, "desc"),
          Query.limit(100),
        ),
      );
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
      list,
      listLabels,
      listIds,
      reactiveNotes,
      reactiveStreamList,
      reactiveFindPreview,
      reactiveSearchPreview,
    };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(Layer.provide(DB.Service.layer));
}

export type Create = Types.MergeRight<
  Record,
  {
    readonly id?: RecordSchema.Id;
    readonly materializedYUpdate?: MaterializedYUpdate;
    readonly lastEventLocalSeq?: Record["lastEventLocalSeq"];
  }
>;

export type Update = Partial<Omit<Record, "id">>;

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
  readonly record: Record;
  /** Previews of the record's outgoing [[link]] targets. */
  readonly backlinks: ReadonlyArray<Preview>;
};

export type BootResult = {
  readonly record: BootRecord;
  /** Previews of the record's outgoing [[link]] targets, for priming the record cache. */
  readonly backlinks: ReadonlyArray<Preview>;
};

export const bootResultEmpty = (): BootResult => ({
  record: {
    lastEventLocalSeq: 0,
    materializedYUpdate: null,
  },
  backlinks: [],
});

export type StreamListQuery = {
  readonly filter: AttrsSchema.Filter;
  readonly sort: "date" | "updated";
};

const recordFields = [
  "id",
  "title",
  "content",
  "text",
  "date",
  "materializedYUpdate",
  "createdAt",
  "updatedAt",
  "lastEventLocalSeq",
] as const;

// Explicit column and select types keep QB's JSON metadata nameable in emitted declarations.
const recordColumns: Pick<typeof Tables.records, (typeof recordFields)[number]> = Struct.pick(
  Tables.records,
  recordFields,
);

const recordSelect: ReturnType<typeof Query.select<typeof recordColumns>> =
  Query.select(recordColumns);

export type Record = Query.ResultRow<typeof recordSelect>;

export type MaterializedYUpdate = Record["materializedYUpdate"];

// Ordering/grouping metadata only — content and Yjs blobs would make every
// reactive re-query heavy and are served per record instead.
const streamSelect = Query.select({
  id: Tables.records.id,
  date: Tables.records.date,
  createdAt: Tables.records.createdAt,
  updatedAt: Tables.records.updatedAt,
});

/** Ordering/grouping metadata for stream lists; content stays out of list queries. */
export type Meta = Query.ResultRow<typeof streamSelect>;

const previewSelect = Query.select({
  id: Tables.records.id,
  title: Tables.records.title,
  text: Tables.records.text,
  date: Tables.records.date,
  createdAt: Tables.records.createdAt,
  updatedAt: Tables.records.updatedAt,
});

export type Preview = Query.ResultRow<typeof previewSelect>;

const bootSelect = Query.select({
  materializedYUpdate: Tables.records.materializedYUpdate,
  lastEventLocalSeq: Tables.records.lastEventLocalSeq,
});

/** One-shot editor boot payload — read atomically once; events drive the doc afterwards. */
export type BootRecord = Query.ResultRow<typeof bootSelect>;

const idSelect = Query.select({ id: Tables.records.id });

export * as RecordRepo from "./record.repo";
