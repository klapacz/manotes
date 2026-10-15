import { RecordSchema } from "../record.schema";
import { Match, Predicate, Record, Schema, Struct } from "effect";
import { Cast, Fragment, Json, Query, Scalar, Table, Type } from "effect-qb";
import { Tables } from "../db.tables";
import { AttrsSchema } from "../attrs.schema";
import { BuiltinAttrs } from "../builtin-attrs";
import type { StreamListQuery } from "../record.repo";

// Required for declaration output: QB's inferred return exposes private types and exceeds TS's size limit.
type RecordPredicate = Scalar.Scalar<
  boolean,
  ReturnType<typeof Type.boolean>,
  Scalar.Nullability,
  "standard",
  "scalar",
  "records"
>;

const def = Table.alias(Tables.records, "prop_def");

export function filterPredicate(query: StreamListQuery): RecordPredicate {
  // Always run the type handler so an omitted type still selects records.
  const predicates = Struct.evolve(Struct.omit({ ...query, type: query.type }, ["sort"]), {
    type: (type) => [typePredicate(type)],
    date: (date) => (date ? [Query.eq(Tables.records.date, date)] : []),
    search: (search) => (search?.trim() ? [searchPredicate(search.trim())] : []),
    props: (props) => {
      return Record.toEntries(props ?? {}).map(([id, value]) => propertyPredicate(id, value));
    },
    backlinksTo: (id) => (id === undefined ? [] : [linkPredicate("incoming", id)]),
    linksFrom: (id) => (id === undefined ? [] : [linkPredicate("outgoing", id)]),
  });

  return Query.andAll(
    Record.values<string, RecordPredicate[] | undefined>(predicates).flatMap(
      (predicates) => predicates ?? [],
    ),
  );
}

export function propertyPredicate(
  propId: RecordSchema.Id,
  value: AttrsSchema.PropVal,
): RecordPredicate {
  // Any assignment blocks the default, including null or wrongly tagged values.
  const assignment = Query.select({ id: Tables.props.recordId }).pipe(
    Query.from(Tables.props),
    Query.where(
      Query.and(
        Query.eq(Tables.props.recordId, Tables.records.id),
        Query.eq(Tables.props.propId, propId),
      ),
    ),
  );

  // Archived ignores definition rows. An unset value means false.
  if (propId === BuiltinAttrs.archivedId) {
    if (!Predicate.isTagged(value, "bool")) return Query.literal(false);

    const stored = assignment.pipe(
      Query.where(
        Query.and(
          Query.eq(Tables.props.value._tag.pipe(Json.text), "bool"),
          Query.eq(Cast.to(Tables.props.value.val.pipe(Json.text), Type.int()), value.val ? 1 : 0),
        ),
      ),
    );

    return Query.or(
      Query.exists(stored),
      Query.and(Query.not(Query.exists(assignment)), Query.literal(value.val === false)),
    );
  }

  // Only enabled, valid property definitions participate in filtering.
  const definition = Query.select({ id: def.id }).pipe(
    Query.from(def),
    Query.where(
      Query.and(Query.eq(def.id, propId), Query.eq(def._tag, "prop"), Query.eq(def.attrs_valid, 1)),
    ),
  );

  // Extract JSON values using the SQL type required for each property kind.
  const comparisons = Match.value(value).pipe(
    Match.tag("number", ({ val }) => ({
      stored: Query.eq(Cast.to(Tables.props.value.val.pipe(Json.text), Type.real()), val),
      fallback: Query.eq(Cast.to(def.prop_default.val.pipe(Json.text), Type.real()), val),
    })),
    Match.tag("bool", ({ val }) => ({
      stored: Query.eq(Cast.to(Tables.props.value.val.pipe(Json.text), Type.int()), val ? 1 : 0),
      fallback: Query.eq(Cast.to(def.prop_default.val.pipe(Json.text), Type.int()), val ? 1 : 0),
    })),
    Match.orElse(({ val }) => ({
      stored: Query.eq(Tables.props.value.val.pipe(Json.text), val),
      fallback: Query.eq(def.prop_default.val.pipe(Json.text), val),
    })),
  );

  // Use the default only when no assignment exists; otherwise require the stored tag.
  const comparison = Query.or(
    Query.and(Query.isNull(Tables.props.recordId), comparisons.fallback),
    Query.and(Query.eq(Tables.props.value._tag.pipe(Json.text), value._tag), comparisons.stored),
  );

  const matching = definition.pipe(
    Query.leftJoin(
      Tables.props,
      Query.and(
        Query.eq(Tables.props.recordId, Tables.records.id),
        Query.eq(Tables.props.propId, propId),
      ),
    ),
    Query.where(Query.and(Query.eq(def.prop_type, value._tag), comparison)),
  );

  // Ignore unknown or disabled definitions; active definitions must match.
  return Query.or(Query.not(Query.exists(definition)), Query.exists(matching));
}

function typePredicate(type: StreamListQuery["type"]) {
  return Match.value(type).pipe(
    Match.tag("enum_option", ({ enum_parent }) => {
      return Query.and(
        Query.eq(Tables.records._tag, "owned"),
        Query.eq(Tables.records.owned_type, "enum_option"),
        Query.eq(Tables.records.owned_parent, enum_parent),
      );
    }),
    Match.tag("rule", () => Query.eq(Tables.records._tag, "rule")),
    Match.tag("prop", () => Query.eq(Tables.records._tag, "prop")),
    Match.tag("pages", () => {
      return Query.and(
        Query.eq(Tables.records._tag, "note"),
        Query.isNotNull(Tables.records.title),
      );
    }),
    Match.tag("notes", () => {
      return Query.and(Query.eq(Tables.records._tag, "note"), Query.isNull(Tables.records.title));
    }),
    Match.orElse(() => Query.eq(Tables.records._tag, "note")),
  );
}

function searchPredicate(search: string) {
  const pattern = Query.literal(`%${search.replace(/[!%_]/g, "!$&")}%`);

  // effect-qb 0.24.1 Query.like has no ESCAPE argument.
  return Fragment.expression({
    dbType: Type.boolean(),
    schema: Schema.Boolean,
    nullability: "maybe",
  })`(${Tables.records.title} LIKE ${pattern} ESCAPE '!' OR ${Tables.records.text} LIKE ${pattern} ESCAPE '!')`;
}

function linkPredicate(direction: "incoming" | "outgoing", id: RecordSchema.Id) {
  return Query.exists(
    Query.select({ id: Tables.backlinks.sourceId }).pipe(
      Query.from(Tables.backlinks),
      Query.where(
        direction === "incoming"
          ? Query.and(
              Query.eq(Tables.backlinks.sourceId, Tables.records.id),
              Query.eq(Tables.backlinks.targetId, id),
            )
          : Query.and(
              Query.eq(Tables.backlinks.targetId, Tables.records.id),
              Query.eq(Tables.backlinks.sourceId, id),
            ),
      ),
    ),
  );
}

export * as RecordFilter from "./filter";
