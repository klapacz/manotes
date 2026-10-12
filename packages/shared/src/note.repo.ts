import {
  Array,
  Effect,
  flow,
  Layer,
  Option,
  pipe,
  Schema,
  Context,
  Stream,
  Record,
  Predicate,
  Match,
} from "effect";
import { DB } from "./db.service";
import { NoteSchema } from "./note.schema";
import { Tables } from "./db.tables";
import { and, asc, desc, eq, isNotNull, isNull, like, ne, or, sql, type SQL } from "drizzle-orm";
import { alias, type SQLiteSelect } from "drizzle-orm/sqlite-core";
import type { PaneSchema } from "./note/pane.schema";
import { StreamSettings } from "./note/stream-settings";
import { nanoid } from "nanoid";
import { LibOption } from "./effect/option";
import { EffectOption } from "./effect/effect-option";
import { BuiltinAttrs } from "./builtin-attrs";
import { AttrsSchema } from "./attrs.schema";

const decodeRecord = Schema.decodeEffect(NoteSchema.Record);

const decodeRecordArray = Schema.decodeEffect(Schema.Array(NoteSchema.Record));

const decodePreview = Schema.decodeEffect(NoteSchema.Preview);

const decodePreviewArray = Schema.decodeEffect(Schema.Array(NoteSchema.Preview));

const decodeMetaArray = Schema.decodeEffect(Schema.Array(NoteSchema.Meta));

const decodeBootRecord = Schema.decodeEffect(NoteSchema.BootRecord);

export class Service extends Context.Service<Service>()("NoteRepo.Service", {
  make: Effect.gen(function* () {
    const db = yield* DB.Service;

    const create = Effect.fn("NoteRepo.create")(function* (note: typeof NoteSchema.Create.Type) {
      const encoded = yield* pipe(note, Schema.encodeEffect(NoteSchema.Create));

      const id = encoded.id ?? nanoid();

      return yield* db
        .find((db) =>
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
        )
        .pipe(EffectOption.traverseOrElse(decodeRecord, () => new DB.NotFoundError()));
    });

    const updateById = Effect.fn("NoteRepo.updateById")(function* (
      id: string,
      updates: typeof NoteSchema.Update.Type,
    ) {
      const encoded = yield* pipe(updates, Schema.encodeEffect(NoteSchema.Update));

      return yield* db
        .find((db) =>
          db.update(Tables.notes).set(encoded).where(eq(Tables.notes.id, id)).returning(),
        )
        .pipe(EffectOption.traverseOrElse(decodeRecord, () => new DB.NotFoundError()));
    });

    const updateAttrs = Effect.fn("NoteRepo.updateAttrs")(function* (opts: {
      readonly id: NoteSchema.Id;
      readonly columns: AttrsColumns;
    }) {
      const columns = yield* encodeAttrsColumns(opts.columns);
      yield* db.execute((db) =>
        db.update(Tables.notes).set(columns).where(eq(Tables.notes.id, opts.id)),
      );
    });

    const findById = Effect.fn("NoteRepo.findById")(function* (id: string) {
      return yield* db
        .find((db) => db.select().from(Tables.notes).where(eq(Tables.notes.id, id)))
        .pipe(EffectOption.traverse(decodeRecord));
    });

    const findIdByTitle = Effect.fn("NoteRepo.findIdByTitle")(function* (title: string) {
      return yield* db.find((db) =>
        db
          .select({ id: Tables.notes.id })
          .from(Tables.notes)
          .where(eq(Tables.notes.title, title))
          .orderBy(asc(Tables.notes.createdAt), asc(Tables.notes.id))
          .limit(1),
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
          );
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
          .pipe(EffectOption.traverse(decodeBootRecord)),
        findOutgoingBacklinkPreviews(id),
        (record, backlinks) => {
          return record.pipe(
            Option.flatMap((record) => Option.some<BootResult>({ record, backlinks })),
          );
        },
        { concurrent: true },
      );
    });

    const findAllRecords = Effect.fn("NoteRepo.findAllRecords")(function* () {
      return yield* db
        .query((db) => db.select().from(Tables.notes).where(eq(Tables.notes._tag, "note")))
        .pipe(Effect.flatMap(decodeRecordArray));
    });

    const reactiveStreamRecords = Effect.fn("NoteRepo.reactiveStreamRecords")(function* () {
      return yield* db
        .reactiveQuery((db) => db.select().from(Tables.notes).where(eq(Tables.notes._tag, "note")))
        .pipe(Effect.map(Stream.mapEffect((rows) => decodeRecordArray(rows))));
    });

    const reactiveStreamList = Effect.fn("NoteRepo.reactiveStreamList")(function* (
      query: StreamListQuery,
    ) {
      const stream = yield* db.reactiveQuery((db) => {
        // Within a date, newest-created first; edits should not move rows.
        const orderBy =
          query.sort === "date"
            ? [desc(Tables.notes.date), desc(Tables.notes.createdAt)]
            : [desc(Tables.notes.updatedAt)];

        return filterStatement(db.select(streamColumns).from(Tables.notes).$dynamic(), {
          query,
          conditions: [],
        }).orderBy(...orderBy);
      });

      return stream.pipe(Stream.mapEffect((n) => decodeMetaArray(n)));
    });

    const reactiveFindPreviewById = Effect.fn("NoteRepo.reactiveFindPreviewById")(function* (
      id: string,
    ) {
      const stream = yield* db
        .reactiveQuery((db) =>
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
        )
        .pipe(Effect.map(Stream.mapEffect(flow(Array.head, LibOption.mapEffect(decodePreview)))));

      return stream;
    });

    const reactiveSearchPreview = Effect.fn("NoteRepo.reactiveSearch")(function* (
      opts: SearchPreviewQuery,
    ) {
      const stream = yield* db.reactiveQuery((db) => {
        const trimmed = opts.search.trim();

        const conditions = [
          ne(Tables.notes.text, ""),
          trimmed.length > 0
            ? or(like(Tables.notes.title, `%${trimmed}%`), like(Tables.notes.text, `%${trimmed}%`))
            : undefined,
        ].filter((condition) => condition !== undefined);

        const query =
          opts.filter === undefined
            ? { sort: "updated" as const }
            : {
                ...opts.filter,
                props: StreamSettings.propFilters(opts.filter),
                sort: "updated" as const,
              };

        return filterStatement(
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
            .$dynamic(),
          { query, conditions },
        )
          .limit(100)
          .orderBy(
            // Prefer title matches over body-only matches for non-empty searches,
            // then keep the result order deterministic by creation time. An empty
            // search has no rank term: SQLite reads `ORDER BY 0` as a column index.
            ...(trimmed.length > 0
              ? [sql`CASE WHEN ${Tables.notes.title} LIKE ${`%${trimmed}%`} THEN 0 ELSE 1 END`]
              : []),
            desc(Tables.notes.createdAt),
          );
      });

      return stream.pipe(Stream.mapEffect((rows) => decodePreviewArray(rows)));
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

export const AttrsColumns = Schema.Struct({
  _tag: AttrsSchema.RecordTag,
  prop_type: Schema.NullOr(AttrsSchema.PropValTag),
  prop_default: Schema.NullOr(Schema.fromJsonString(AttrsSchema.PropVal)),
  prop_targets: Schema.NullOr(Schema.fromJsonString(AttrsSchema.TargetFilter)),
  owned_type: Schema.NullOr(Schema.Literal("enum_option")),
  owned_parent: Schema.NullOr(NoteSchema.Id),
  rule_targets: Schema.NullOr(Schema.fromJsonString(AttrsSchema.TargetFilter)),
  attrs_valid: Schema.BooleanFromBit,
});

export type AttrsColumns = typeof AttrsColumns.Type;

const encodeAttrsColumns = Schema.encodeEffect(AttrsColumns);

export type NoteWithBacklinks = {
  readonly record: NoteSchema.Record;
  /** Previews of the note's outgoing [[link]] targets. */
  readonly backlinks: ReadonlyArray<typeof NoteSchema.Preview.Type>;
};

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

// Ordering/grouping metadata only — content and Yjs blobs would make every
// reactive re-query heavy and are served per note instead.
const streamColumns = {
  id: Tables.notes.id,
  date: Tables.notes.date,
  createdAt: Tables.notes.createdAt,
  updatedAt: Tables.notes.updatedAt,
} as const;

// Shared by stream lists and reference searches, before their sorting or result limit.
// Dynamic builders mutate in place; explicit projections keep joined columns out of the result.
function filterStatement<T extends SQLiteSelect>(
  statement: T,
  opts: {
    readonly query: StreamListQuery;
    readonly conditions: readonly SQL[];
  },
) {
  const { query } = opts;
  const conditions = [...streamFilterConditions(query), ...opts.conditions];

  for (const [index, [propId, value]] of Record.toEntries(query.props ?? {}).entries()) {
    const prop = alias(Tables.props, `prop_${index}`);
    // Each filter gets its own assignment join. LEFT JOIN keeps records with
    // no stored value so the comparison can use the definition's default.
    statement.leftJoin(prop, and(eq(prop.recordId, Tables.notes.id), eq(prop.propId, propId)));

    const builtin = BuiltinAttrs.find(propId);

    if (Option.isSome(builtin)) {
      const def = builtin.value;

      if (def.prop_type !== value._tag) {
        conditions.push(sql`0`);
        continue;
      }

      // Builtins have code-defined defaults, without a definition row.
      // Only missing assignments use the default; wrong tags become NULL
      // and cannot match the requested value.
      conditions.push(sql`CASE
        WHEN ${prop.recordId} IS NULL THEN ${propSqlValue(def.prop_default)}
        WHEN json_extract(${prop.value}, '$._tag') = ${value._tag}
          THEN json_extract(${prop.value}, '$.val')
        ELSE NULL
      END = ${propSqlValue(value)}`);
      continue;
    }

    const def = alias(Tables.notes, `prop_def_${index}`);
    statement.leftJoin(def, and(eq(def.id, propId), eq(def._tag, "prop"), eq(def.attrs_valid, 1)));

    // An unavailable or invalid definition leaves the saved filter inactive.
    // Otherwise compare the stored value, or the default when unset. A wrong
    // definition/value tag cannot match, including when a default exists.
    conditions.push(sql`(${def.id} IS NULL OR (${def.prop_type} = ${value._tag} AND CASE
      WHEN ${prop.recordId} IS NULL THEN json_extract(${def.prop_default}, '$.val')
      WHEN json_extract(${prop.value}, '$._tag') = ${value._tag}
        THEN json_extract(${prop.value}, '$.val')
      ELSE NULL
    END = ${propSqlValue(value)}))`);
  }

  if (query.backlinksTo !== undefined) {
    const incoming = alias(Tables.backlinks, "incoming");
    statement.innerJoin(
      incoming,
      and(eq(incoming.sourceId, Tables.notes.id), eq(incoming.targetId, query.backlinksTo)),
    );
  }

  if (query.linksFrom !== undefined) {
    const outgoing = alias(Tables.backlinks, "outgoing");
    statement.innerJoin(
      outgoing,
      and(eq(outgoing.targetId, Tables.notes.id), eq(outgoing.sourceId, query.linksFrom)),
    );
  }

  return statement.where(and(...conditions));
}

function streamFilterConditions(query: StreamListQuery): Array<SQL> {
  const conditions = Match.value(query.type).pipe(
    Match.tag("enum_option", ({ enum_parent }) => [
      eq(Tables.notes._tag, "owned"),
      eq(Tables.notes.owned_type, "enum_option"),
      eq(Tables.notes.owned_parent, enum_parent),
    ]),
    Match.tag("prop", () => [eq(Tables.notes._tag, "prop")]),
    Match.orElse(() => [eq(Tables.notes._tag, "note")]),
  );

  if (Predicate.isTagged(query.type, "pages")) conditions.push(isNotNull(Tables.notes.title));

  if (Predicate.isTagged(query.type, "notes")) conditions.push(isNull(Tables.notes.title));

  if (query.date) conditions.push(eq(Tables.notes.date, query.date));

  const search = query.search?.trim();

  if (search) {
    // Treat LIKE wildcards as literal text in the search field.
    const pattern = `%${search.replace(/[!%_]/g, "!$&")}%`;

    conditions.push(
      sql`(${Tables.notes.title} LIKE ${pattern} ESCAPE '!' OR ${Tables.notes.text} LIKE ${pattern} ESCAPE '!')`,
    );
  }

  return conditions;
}

function propSqlValue(value: AttrsSchema.PropVal | null) {
  if (value === null) {
    return null;
  }

  if (Predicate.isTagged(value, "bool")) {
    return value.val ? 1 : 0;
  }

  return value.val;
}

export * as NoteRepo from "./note.repo";
