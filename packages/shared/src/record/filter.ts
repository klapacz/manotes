import type { RecordSchema } from "../record.schema";
import { Array, Equal, Match, Option, Record, Schema, pipe } from "effect";
import { Cast, Fragment, Json, Query, Scalar, Table, Type } from "effect-qb";
import { Tables } from "../db.tables";
import { AttrsSchema } from "../attrs.schema";
import { BuiltinAttrs } from "../builtin-attrs";
import { DBPredicates } from "../db.predicates.internal";
import type { RuleRecord } from "../rule-record.service";
import type { Attrs } from "../attrs.service";
import type { PropRecordRepo } from "../prop-record.repo";
import { Filters } from "./filters";

export type Metadata = {
  readonly rules?: readonly RuleRecord.Rule[];
  readonly defs?: Attrs.Defs;
};

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

const saved = Table.alias(Tables.props, "saved_prop");

export function filterPredicate(
  filter: AttrsSchema.Filter,
  metadata: Metadata = {},
): RecordPredicate {
  // The root array is an implicit AND; an empty filter matches everything.
  return Array.reduce<AttrsSchema.FilterExpr, RecordPredicate>(
    filter,
    Query.literal(true),
    (predicate, expression) => {
      return Query.and(predicate, expressionPredicate(expression, metadata));
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

function expressionPredicate(
  expression: AttrsSchema.FilterExpr,
  metadata: Metadata,
): RecordPredicate {
  return Match.value(expression).pipe(
    Match.tag("and", ({ val }) => filterPredicate(val, metadata)),
    Match.tag("or", ({ val }) => {
      return Array.reduce<AttrsSchema.FilterExpr, RecordPredicate>(
        val,
        Query.literal(false),
        (predicate, child) => {
          return Query.or(predicate, expressionPredicate(child, metadata));
        },
      );
    }),
    Match.tag("cmp", ({ val }) => comparisonPredicate(val, metadata)),
    Match.exhaustive,
  );
}

function comparisonPredicate(
  comparison: AttrsSchema.FilterCmp,
  metadata: Metadata,
): RecordPredicate {
  return Match.value(comparison).pipe(
    Match.when(["id", "=", Schema.is(AttrsSchema.RecordId)], ([, , id]) => {
      return Query.eq(Tables.records.id, id);
    }),
    Match.when(["_tag", "=", Schema.is(AttrsSchema.RecordTag)], ([, , tag]) => {
      return Query.eq(Tables.records._tag, tag);
    }),
    Match.when(["prop_type", "=", Schema.is(AttrsSchema.PropValTag)], ([, , type]) => {
      return Query.eq(Tables.records.prop_type, type);
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
    Match.when([["prop", Schema.is(AttrsSchema.RecordId)], "violation", true], ([[, propId]]) => {
      if (metadata.defs === undefined) return Query.literal(false);

      const def = Record.get(metadata.defs, propId);

      if (Option.isNone(def)) return Query.literal(false);

      return propertyViolationPredicate(propId, def.value);
    }),
    Match.when([["rule", Schema.is(AttrsSchema.RecordId)], "violation", true], ([[, ruleId]]) => {
      return pipe(
        metadata.rules ?? [],
        Array.findFirst((rule) => rule.id === ruleId),
        Option.match({
          onNone: () => Query.literal(false),
          onSome: ruleViolationPredicate,
        }),
      );
    }),
    Match.when(["rules", "violation", true], () => {
      return pipe(
        metadata.rules ?? [],
        Array.map(ruleViolationPredicate),
        DBPredicates.orAllBalanced,
      );
    }),
    Match.exhaustive,
  );
}

function ruleViolationPredicate(rule: RuleRecord.Rule): RecordPredicate {
  return Query.and(filterPredicate(rule.rule_targets), missingRequiredProps(rule));
}

function propertyViolationPredicate(
  propId: RecordSchema.Id,
  def: PropRecordRepo.Def,
): RecordPredicate {
  const recordsWithInvalidProp = Query.select({ id: saved.recordId }).pipe(
    Query.from(saved),
    Query.where(Query.eq(saved.propId, propId)),
    Query.where(savedValueIsInvalid(def)),
  );

  // IN lets SQLite start from the property index instead of checking assignments for every record.
  return Query.inSubquery(Tables.records.id, recordsWithInvalidProp);
}

function savedValueIsInvalid(def: PropRecordRepo.Def) {
  const wrongType = Query.isDistinctFrom(saved.value._tag.pipe(Json.text), def.prop_type);

  const targets = Match.value(def).pipe(
    Match.when({ prop_type: "link" }, (def) => Option.some(def.prop_targets ?? [])),
    Match.when({ prop_type: "enum" }, (def) => {
      return Option.some([Filters.enumOptions.make(def.id), Filters.aliases.unarchived.make()]);
    }),
    Match.when({ prop_type: Match.is("text", "number", "bool") }, () => Option.none()),
    Match.exhaustive,
  );

  if (Option.isNone(targets)) return wrongType;

  const validTarget = Query.select({ id: Tables.records.id }).pipe(
    Query.from(Tables.records),
    Query.where(Query.eq(Tables.records.id, saved.value.val.pipe(Json.text))),
    Query.where(filterPredicate(targets.value)),
  );

  return Query.or(wrongType, Query.not(Query.exists(validTarget)));
}

function missingRequiredProps(rule: RuleRecord.Rule): RecordPredicate {
  const pathMatches = Match.value(rule.rule_storage).pipe(
    Match.tag("top", () => Tables.props.path.pipe(Json.pathExists(Json.index(0)), Query.not)),
    Match.tag("group", () => {
      return Query.and(
        Query.eq(Tables.props.path.pipe(Json.index(0), Json.text), rule.id),
        Tables.props.path.pipe(Json.pathExists(Json.index(1)), Query.not),
      );
    }),
    Match.exhaustive,
  );

  return pipe(
    rule.expects,
    Record.filter(AttrsSchema.RuleExpectation.guards.required),
    Record.keys,
    Array.map((propId) => {
      return Query.select({ id: Tables.props.recordId }).pipe(
        Query.from(Tables.props),
        Query.where(
          Query.and(
            Query.eq(Tables.props.recordId, Tables.records.id),
            Query.eq(Tables.props.propId, propId),
            pathMatches,
          ),
        ),
        (plan) => Query.exists(plan),
        Query.not,
      );
    }),
    DBPredicates.orAllBalanced,
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
