// SQLite JSON helpers for effect-qb 0.24.1. Internal query/projection APIs
// retain source tracking and reuse its row decoder; no dependency code is copied.
import { Schema } from "effect";
import { Executor, Fragment, Query, RowSet, Scalar, Type, makeExpression } from "effect-qb";
import * as CoreRenderer from "effect-qb/internal/renderer";
import * as ExpressionAst from "effect-qb/internal/expression-ast";
import * as CoreQuery from "effect-qb/internal/query";
import type * as Sqlite from "effect-qb/sqlite";
import { flattenSelection } from "effect-qb/internal/projections";

const dialect = "sqlite";

// Decoded rows may contain DateTime objects, so they cannot use QB's raw JSON validation.
const jsonRowsDb = Type.custom("decoded_json_rows");

type JsonRowsDb = typeof jsonRowsDb;

type Dependencies<P extends Query.Plan.Any> = Extract<CoreQuery.OutstandingOfPlan<P>, string>;

type SelectSubquery<P extends Query.Plan.Any> =
  CoreQuery.StatementOfPlan<P> extends "select"
    ? CoreQuery.DialectCompatibleNestedPlan<P, "sqlite">
    : never;

export type JsonArray<P extends Query.Plan.Any> = Scalar.Scalar<
  ReadonlyArray<Query.ResultRow<P>>,
  JsonRowsDb,
  "never",
  "sqlite",
  "scalar",
  Dependencies<P>
> & { readonly [ExpressionAst.TypeId]: ExpressionAst.CustomSqlNode };

export type JsonObject<P extends Query.Plan.Any> = Scalar.Scalar<
  Query.ResultRow<P> | null,
  JsonRowsDb,
  "maybe",
  "sqlite",
  "scalar",
  Dependencies<P>
> & { readonly [ExpressionAst.TypeId]: ExpressionAst.CustomSqlNode };

export type Options = Pick<Sqlite.Executor.MakeOptions, "valueMappings" | "reportInput">;

export function make(options: Options) {
  function jsonArrayFrom<P extends Query.Plan.Any>(
    plan: P & SelectSubquery<NoInfer<P>>,
  ): JsonArray<P> {
    const { ast, dependencies, decodeRows } = prepare(plan, options);

    return makeExpression<
      ReadonlyArray<Query.ResultRow<P>>,
      JsonRowsDb,
      "never",
      "sqlite",
      "scalar",
      Dependencies<P>,
      ExpressionAst.CustomSqlNode
    >(
      {
        runtime: [],
        dbType: jsonRowsDb,
        nullability: "never",
        dialect,
        kind: "scalar",
        dependencies,
        driverValueMapping: { fromDriver: decodeRows },
      },
      ast,
    );
  }

  function jsonObjectFrom<P extends Query.Plan.Any>(
    plan: P & SelectSubquery<NoInfer<P>>,
  ): JsonObject<P> {
    const { ast, dependencies, decodeRows } = prepare(plan, options);

    return makeExpression<
      Query.ResultRow<P> | null,
      JsonRowsDb,
      "maybe",
      "sqlite",
      "scalar",
      Dependencies<P>,
      ExpressionAst.CustomSqlNode
    >(
      {
        runtime: null,
        dbType: jsonRowsDb,
        nullability: "maybe",
        dialect,
        kind: "scalar",
        dependencies,
        driverValueMapping: {
          fromDriver: (raw) => {
            const rows = decodeRows(raw);

            if (rows.length > 1) {
              throw new Error(
                "jsonObjectFrom expected at most one row; use limit(1) when choosing one",
              );
            }

            return rows[0] ?? null;
          },
        },
      },
      ast,
    );
  }

  return { jsonArrayFrom, jsonObjectFrom };
}

function prepare<P extends Query.Plan.Any>(plan: P, options: Options) {
  if (CoreQuery.getAst(plan).kind !== "select") {
    throw new Error("JSON helpers currently require a SELECT");
  }

  const required = Schema.decodeUnknownSync(Schema.Array(Schema.String))(
    plan[RowSet.TypeId].required,
  );

  const projections = flattenSelection(CoreQuery.getAst(plan).select);

  if (projections.length === 0) throw new Error("JSON subqueries need selected columns");

  for (const { expression } of projections) {
    const db = expression[Scalar.TypeId].dbType;

    if (db.kind === "blob") {
      throw new Error("Binary columns cannot be selected by JSON subquery helpers");
    }
  }

  const names = new Set([...Object.keys(plan[RowSet.TypeId].available), ...required]);
  let alias = "__qb_json_from";

  while (names.has(alias)) alias += "_";

  const dependencies: Record<string, true> = Object.fromEntries(
    required.map((name: string) => [name, true]),
  );

  // A multi-column SELECT is inserted only in FROM, never used as a scalar value.
  const subquery = makeExpression(
    {
      runtime: null,
      dbType: Type.custom("subquery_rows"),
      nullability: "maybe",
      dialect,
      dependencies,
    },
    { kind: "scalarSubquery", plan },
  );

  const values: Array<Scalar.Any | Fragment.Identifier> = [];

  const strings = ["(SELECT COALESCE(json_group_array(json_object("];

  const text = (sql: string) => {
    strings[strings.length - 1] += sql;
  };

  const value = (expression: Scalar.Any | Fragment.Identifier) => {
    values.push(expression);
    strings.push("");
  };

  for (const [index, projection] of projections.entries()) {
    if (index > 0) text(", ");

    value(Query.literal(projection.alias));

    text(", ");
    const db = projection.expression[Scalar.TypeId].dbType;
    const preserveNumericString = db.runtime === "bigintString" || db.runtime === "decimalString";

    if (preserveNumericString) text("CAST(");
    value(Fragment.identifier(alias, projection.alias));

    if (preserveNumericString) text(" AS TEXT)");
  }

  text(")), '[]') FROM ");
  value(subquery);
  text(" AS ");
  value(Fragment.identifier(alias));
  text(")");

  const ast: ExpressionAst.CustomSqlNode = { kind: "customSql", strings, values };

  const rendered = {
    sql: "<JSON subquery>",
    params: [],
    dialect,
    projections: projections.map(({ path, alias: columnAlias }) => ({ path, alias: columnAlias })),
    [CoreRenderer.TypeId]: { row: undefined, dialect },
  };

  const decodeRow = Executor.makeRowDecoder(rendered, plan, options);

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- JSON is parsed and each projected field is decoded at the driver boundary.
  const decodeRows = (raw: unknown): ReadonlyArray<Query.ResultRow<P>> => {
    const rows = decodeSerializedRows(raw);

    return rows.map((row) => decodeRow(row));
  };

  return { ast, dependencies, decodeRows };
}

const FlatRows = Schema.Array(Schema.Record(Schema.String, Schema.Unknown));

const decodeSerializedRows = Schema.decodeUnknownSync(Schema.fromJsonString(FlatRows));

export * as SqliteJson from "./json";
