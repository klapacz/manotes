import { DatabaseSync } from "node:sqlite";
import { Schema, Predicate } from "effect";
import { sql, getTableColumns } from "drizzle-orm";
import {
  sqliteTable,
  integer,
  customType,
  primaryKey,
  unique,
  index,
  uniqueIndex,
  check,
  foreignKey,
  getTableConfig,
  type AnySQLiteTable,
  type AnySQLiteColumn,
  type SQLiteTableExtraConfigValue,
} from "drizzle-orm/sqlite-core";
import * as InternalTable from "effect-qb/internal/table";
import * as SchemaExpression from "effect-qb/internal/schema-expression-value";
import { Query, QueryAst, type Table } from "effect-qb";
import { renderQueryAst, renderExpression } from "effect-qb/internal/sql-expression-renderer";
import { toDriverValue } from "effect-qb/internal/runtime/driver-value-mapping";
import { sqliteDialect } from "effect-qb/sqlite/internal/dialect";
import type { RenderState } from "effect-qb/internal/dialect";
import type { DdlExpressionLike, TableOptionSpec } from "effect-qb/internal/table-options";

/** Generation-only declarations. QB remains the app's schema and query builder. */
export function toDrizzleTables(tables: readonly Table.AnyTable[]): readonly AnySQLiteTable[] {
  const database = new DatabaseSync(":memory:");
  const translated = new Map<string, AnySQLiteTable>();
  const definitions = new Map<string, string>();

  const expression = (value: DdlExpressionLike) => {
    if (SchemaExpression.isSchemaExpression(value)) return sql.raw(SchemaExpression.render(value));
    const state = renderState();

    const rendered = renderExpression(value, state, {
      ...sqliteDialect,
      renderLiteral: (value, state, context) => {
        const mapped = toDriverValue(value, {
          dialect: "sqlite",
          valueMappings: state.valueMappings,
          ...context,
        });

        const input = decodeLiteral(mapped);

        return decodeQuoted(
          database
            .prepare("SELECT quote(?) AS value")
            .get(Predicate.isBoolean(input) ? Number(input) : input),
        ).value;
      },
    });

    if (state.params.length > 0) {
      throw new Error("Parameterized schema expressions are unsupported");
    }

    return sql.raw(rendered);
  };

  try {
    for (const table of tables) {
      const metadata = table[InternalTable.TypeId];

      if (metadata.kind !== "schema") continue;

      if (metadata.casing !== undefined) {
        throw new Error("SQLite translation does not support casing overrides");
      }

      if (metadata.schemaName !== "public" && metadata.schemaName !== "main") {
        throw new Error("SQLite generation only supports the main database");
      }

      const name = metadata.baseName;

      if (name.startsWith("__effectdb_")) throw new Error("The __effectdb_ prefix is reserved");
      // SAFETY: Schema table metadata excludes aliases from discovered exports.
      const ast = Query.createTable(table as Query.SchemaTableLike)[QueryAst.TypeId];
      const state = renderState();
      const rendered = renderQueryAst(ast, state, sqliteDialect);

      if (state.params.length > 0) throw new Error(`Parameterized DDL is unsupported: ${name}`);

      const signature =
        rendered.sql +
        JSON.stringify(table[InternalTable.OptionsSymbol].filter((o) => o.kind === "index"));

      if (definitions.has(name)) {
        if (definitions.get(name) !== signature) {
          throw new Error(`Conflicting table definitions: ${name}`);
        }

        continue;
      }

      definitions.set(name, signature);
      database.exec(rendered.sql);

      const physical = decodeColumns(
        database.prepare("SELECT * FROM pragma_table_xinfo(?)").all(name),
      );

      const autoIncrement = Object.values(metadata.fields).some(
        (c) => Schema.resolveAnnotations(c.schema)?.["effect-db/sqlite/autoIncrement"] === true,
      );

      const columns = Object.fromEntries(
        Object.entries(metadata.fields).map(([columnName, field]) => {
          const description = physical.find((c) => c.name === columnName);

          if (!description) throw new Error(`Missing physical column: ${name}.${columnName}`);

          let column =
            autoIncrement && field.metadata.primaryKey
              ? integer(columnName).primaryKey({ autoIncrement: true })
              : customType<{ data: unknown }>({ dataType: () => description.type })(columnName);

          if (!field.metadata.nullable) column = column.notNull();

          if (field.metadata.generatedValue) {
            column = column.generatedAlwaysAs(expression(field.metadata.generatedValue), {
              mode: "stored",
            });
          } else if (description.dflt_value !== null) {
            column = column.default(sql.raw(`(${description.dflt_value})`));
          }

          return [columnName, column];
        }),
      );

      let extras: SQLiteTableExtraConfigValue[] | undefined;
      translated.set(
        name,
        sqliteTable(name, columns, (dt) => {
          return (extras ??= table[
            InternalTable.OptionsSymbol
          ].flatMap<SQLiteTableExtraConfigValue>((option) => {
            rejectUnsupported(option);

            switch (option.kind) {
              case "primaryKey":
                return autoIncrement
                  ? []
                  : [
                      primaryKey({
                        name: option.name,
                        columns: nonEmptyColumns(dt, option.columns),
                      }),
                    ];
              case "unique":
                return [unique(option.name).on(...nonEmptyColumns(dt, option.columns))];
              case "index": {
                if (!option.columns) throw new Error("Expression indexes need explicit SQL");
                const indexName = option.name ?? `${name}_${option.columns.join("_")}_idx`;

                return [
                  (option.unique ? uniqueIndex : index)(indexName).on(
                    ...nonEmptyColumns(dt, option.columns),
                  ),
                ];
              }

              case "check":
                return [check(option.name, expression(option.predicate))];
              case "foreignKey": {
                const reference = option.references();
                const target = translated.get(reference.tableName);

                if (!target) {
                  throw new Error(`Foreign key target not discovered: ${reference.tableName}`);
                }

                let key = foreignKey({
                  name: option.name,
                  columns: nonEmptyColumns(dt, option.columns),
                  foreignColumns: nonEmptyColumns(getTableColumns(target), reference.columns),
                });

                if (option.onDelete) key = key.onDelete(action(option.onDelete));

                if (option.onUpdate) key = key.onUpdate(action(option.onUpdate));

                return [key];
              }
            }
          }));
        }),
      );
    }

    // Force lazy extra-config evaluation before closing the expression renderer's SQLite connection.
    for (const table of translated.values()) {
      // This public helper resolves keys, checks and references without depending on Kit's snapshot format.
      getTableConfig(table);
    }

    return [...translated.values()];
  } finally {
    database.close();
  }
}

function nonEmptyColumns(
  table: Record<string, AnySQLiteColumn>,
  names: readonly string[],
): [AnySQLiteColumn, ...AnySQLiteColumn[]] {
  const columns = names.map((name) => {
    const column = table[name];

    if (!column) throw new Error(`Missing referenced column: ${name}`);

    return column;
  });

  if (!columns[0]) throw new Error("A constraint requires at least one column");

  return [columns[0], ...columns.slice(1)];
}

function rejectUnsupported(option: TableOptionSpec) {
  if (
    ("deferrable" in option && option.deferrable) ||
    ("initiallyDeferred" in option && option.initiallyDeferred) ||
    (option.kind === "unique" && option.nullsNotDistinct) ||
    (option.kind === "check" && option.noInherit) ||
    (option.kind === "index" &&
      (option.keys || option.predicate || option.include || option.method))
  ) {
    throw new Error(`Unsupported SQLite option: ${option.kind}`);
  }
}

function action(value: "noAction" | "restrict" | "cascade" | "setNull" | "setDefault") {
  const actions = {
    noAction: "no action",
    restrict: "restrict",
    cascade: "cascade",
    setNull: "set null",
    setDefault: "set default",
  } as const;

  return actions[value];
}

function renderState(): RenderState {
  return {
    params: [],
    ctes: [],
    cteNames: new Set(),
    cteSources: new Map(),
    sourceNames: new Map(),
    rowLocalColumns: true,
  };
}

const decodeColumns = Schema.decodeUnknownSync(
  Schema.Array(
    Schema.Struct({
      name: Schema.String,
      type: Schema.String,
      dflt_value: Schema.NullOr(Schema.String),
    }),
  ),
);

const decodeLiteral = Schema.decodeUnknownSync(
  Schema.Union([
    Schema.String,
    Schema.Boolean,
    Schema.Number.check(Schema.isFinite()),
    Schema.BigInt,
    Schema.Null,
    Schema.Uint8Array,
  ]),
);

const decodeQuoted = Schema.decodeUnknownSync(Schema.Struct({ value: Schema.String }));

export * as EffectDbSqliteSchema from "./schema";
