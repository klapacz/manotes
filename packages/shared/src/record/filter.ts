import type { RecordSchema } from "../record.schema";
import { Array, Equal, Match, Option, Schema } from "effect";
import { Cast, Fragment, Json, Query, Scalar, Table, Type } from "effect-qb";
import { Tables } from "../db.tables";
import { AttrsSchema } from "../attrs.schema";
import { BuiltinAttrs } from "../builtin-attrs";

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

export function filterPredicate(filter: AttrsSchema.Filter): RecordPredicate {
  // The root array is an implicit AND; an empty filter matches everything.
  return Array.reduce<AttrsSchema.FilterExpr, RecordPredicate>(
    filter,
    Query.literal(true),
    (predicate, expression) => {
      return Query.and(predicate, expressionPredicate(expression));
    },
  );
}

export function titleMatchPredicate(filter: AttrsSchema.Filter): RecordPredicate {
  // Ranking is deliberately simpler than filtering: any title search hit gets priority.
  return Array.reduce<AttrsSchema.FilterExpr, RecordPredicate>(
    filter,
    Query.literal(false),
    (predicate, expression) => {
      const hit = Match.value(expression).pipe(
        Match.tag("and", "or", ({ val }) => titleMatchPredicate(val)),
        Match.tag("cmp", ({ val }) => {
          return Match.value(val).pipe(
            Match.when(["body", "contains", Match.string], ([, , text]) => {
              return text === ""
                ? Query.literal(false)
                : containsPredicate(Tables.records.title, text);
            }),
            Match.orElse(() => Query.literal(false)),
          );
        }),
        Match.exhaustive,
      );

      return Query.or(predicate, hit);
    },
  );
}

export function propertyPredicate(
  propId: RecordSchema.Id,
  value: AttrsSchema.PropVal,
): RecordPredicate {
  // Stored JSON and defaults need the same typed comparison.
  const comparisons = Match.value(value).pipe(
    Match.tag("number", ({ val }) => ({
      stored: Query.eq(Cast.to(Tables.props.value.val.pipe(Json.text), Type.real()), val),
      fallback: Query.eq(Cast.to(def.prop_default.val.pipe(Json.text), Type.real()), val),
    })),
    Match.tag("bool", ({ val }) => ({
      stored: Query.eq(Cast.to(Tables.props.value.val.pipe(Json.text), Type.int()), val ? 1 : 0),
      fallback: Query.eq(Cast.to(def.prop_default.val.pipe(Json.text), Type.int()), val ? 1 : 0),
    })),
    Match.tag("text", "enum", "link", ({ val }) => ({
      stored: Query.eq(Tables.props.value.val.pipe(Json.text), val),
      fallback: Query.eq(def.prop_default.val.pipe(Json.text), val),
    })),
    Match.exhaustive,
  );

  // Built-ins live in the registry and need no persisted definition row.
  const builtin = BuiltinAttrs.find(propId);

  if (Option.isSome(builtin)) {
    const definition = builtin.value;

    if (definition.prop_type !== value._tag) return Query.literal(false);

    const stored = Query.select({ id: Tables.props.recordId }).pipe(
      Query.from(Tables.props),
      Query.where(
        Query.andAll([
          Query.eq(Tables.props.recordId, Tables.records.id),
          Query.eq(Tables.props.propId, propId),
          Query.eq(Tables.props.value._tag.pipe(Json.text), value._tag),
          comparisons.stored,
        ]),
      ),
    );

    return Query.or(
      Query.exists(stored),
      Query.and(
        Query.not(propertyExistsPredicate(propId)),
        Query.literal(Equal.equals(definition.prop_default, value)),
      ),
    );
  }

  // Missing or invalid definitions cannot satisfy an equality comparison.
  const definition = Query.select({ id: def.id }).pipe(
    Query.from(def),
    Query.where(
      Query.andAll([
        Query.eq(def.id, propId),
        Query.eq(def._tag, "prop"),
        Query.eq(def.attrs_valid, 1),
      ]),
    ),
  );

  const matching = definition.pipe(
    Query.leftJoin(
      Tables.props,
      Query.and(
        Query.eq(Tables.props.recordId, Tables.records.id),
        Query.eq(Tables.props.propId, propId),
      ),
    ),
    Query.where(
      Query.and(
        Query.eq(def.prop_type, value._tag),
        Query.or(
          // A null joined record ID means no assignment exists at any path.
          Query.and(Query.isNull(Tables.props.recordId), comparisons.fallback),
          // Null or wrongly tagged assignments block the default.
          Query.and(
            Query.eq(Tables.props.value._tag.pipe(Json.text), value._tag),
            comparisons.stored,
          ),
        ),
      ),
    ),
  );

  return Query.exists(matching);
}

function expressionPredicate(expression: AttrsSchema.FilterExpr): RecordPredicate {
  return Match.value(expression).pipe(
    Match.tag("and", ({ val }) => filterPredicate(val)),
    Match.tag("or", ({ val }) => {
      return Array.reduce<AttrsSchema.FilterExpr, RecordPredicate>(
        val,
        Query.literal(false),
        (predicate, child) => {
          return Query.or(predicate, expressionPredicate(child));
        },
      );
    }),
    Match.tag("cmp", ({ val }) => comparisonPredicate(val)),
    Match.exhaustive,
  );
}

function comparisonPredicate(comparison: AttrsSchema.FilterCmp): RecordPredicate {
  return Match.value(comparison).pipe(
    Match.when(["id", "=", Schema.is(AttrsSchema.RecordId)], ([, , id]) => {
      return Query.eq(Tables.records.id, id);
    }),
    Match.when(["_tag", "=", Schema.is(AttrsSchema.RecordTag)], ([, , tag]) => {
      return Query.eq(Tables.records._tag, tag);
    }),
    Match.when(["owned_type", "=", "enum_option"], () => {
      return Query.eq(Tables.records.owned_type, "enum_option");
    }),
    Match.when(["owned_parent", "=", Schema.is(AttrsSchema.RecordId)], ([, , id]) => {
      return Query.eq(Tables.records.owned_parent, id);
    }),
    Match.when(["date", "=", Match.string], ([, , date]) => Query.eq(Tables.records.date, date)),
    Match.when(["title", "exists", Match.boolean], ([, , exists]) => {
      return exists ? Query.isNotNull(Tables.records.title) : Query.isNull(Tables.records.title);
    }),
    Match.when(["body", "contains", Match.string], ([, , text]) => {
      return containsPredicate(Tables.records.text, text);
    }),
    Match.when([Schema.is(AttrsSchema.LinkTarget), "exists", true], ([[, direction, id]]) => {
      return linkPredicate(direction, id);
    }),
    Match.when(
      [["prop", Schema.is(AttrsSchema.RecordId)], "=", Schema.is(AttrsSchema.PropVal)],
      ([[, id], , value]) => {
        return propertyPredicate(id, value);
      },
    ),
    Match.when(
      [["prop", Schema.is(AttrsSchema.RecordId)], "exists", Match.boolean],
      ([[, id], , exists]) => {
        return Query.eq(propertyExistsPredicate(id), exists);
      },
    ),
    // Validation comparisons stay in the schema but are not implemented yet.
    Match.when([["prop", Schema.is(AttrsSchema.RecordId)], "invalid", Match.boolean], () => {
      return Query.literal(false);
    }),
    Match.exhaustive,
  );
}

function propertyExistsPredicate(propId: RecordSchema.Id): RecordPredicate {
  // Defaults do not count as assignments. Top-level and grouped rows both count.
  return Query.exists(
    Query.select({ id: Tables.props.recordId }).pipe(
      Query.from(Tables.props),
      Query.where(
        Query.and(
          Query.eq(Tables.props.recordId, Tables.records.id),
          Query.eq(Tables.props.propId, propId),
        ),
      ),
    ),
  );
}

function containsPredicate(
  column: typeof Tables.records.text | typeof Tables.records.title,
  text: string,
): RecordPredicate {
  const pattern = Query.literal(`%${text.replace(/[!%_]/g, "!$&")}%`);

  // effect-qb 0.24.1 Query.like has no ESCAPE argument.
  return Fragment.expression({
    dbType: Type.boolean(),
    schema: Schema.Boolean,
    nullability: "maybe",
  })`${column} LIKE ${pattern} ESCAPE '!'`;
}

function linkPredicate(direction: "->" | "<-", id: RecordSchema.Id): RecordPredicate {
  return Query.exists(
    Query.select({ id: Tables.backlinks.sourceId }).pipe(
      Query.from(Tables.backlinks),
      Query.where(
        Match.value(direction).pipe(
          Match.when("->", () => {
            return Query.and(
              Query.eq(Tables.backlinks.sourceId, Tables.records.id),
              Query.eq(Tables.backlinks.targetId, id),
            );
          }),
          Match.when("<-", () => {
            return Query.and(
              Query.eq(Tables.backlinks.targetId, Tables.records.id),
              Query.eq(Tables.backlinks.sourceId, id),
            );
          }),
          Match.exhaustive,
        ),
      ),
    ),
  );
}

export * as RecordFilter from "./filter";
