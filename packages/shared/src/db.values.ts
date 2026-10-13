import { Array } from "effect";
import { Query, Table } from "effect-qb";
import { getAst } from "effect-qb/internal/query";

type InsertRow<T extends Table.AnyTable> = {
  [K in keyof Table.InsertOf<T>]: K extends keyof Table.SelectOf<T> ? Table.SelectOf<T>[K] : never;
};

type NativeRow<T extends Table.AnyTable> = Parameters<typeof Query.insert<T, InsertRow<T>>>[1];

// QB 0.24.1 VALUES needs SQL expressions; reuse insert's column bindings for every field.
export function values<T extends Table.AnyTable>(
  table: T,
  input: InsertRow<NoInfer<T>> | Array.NonEmptyReadonlyArray<InsertRow<NoInfer<T>>>,
) {
  const rows = Array.isArray(input) ? input : [input];

  if (!Array.isReadonlyArrayNonEmpty(rows)) throw new Error("DB.values requires at least one row");

  let columns: readonly string[] | undefined;

  const bound = Array.map(rows, (row) => {
    // SAFETY: InsertRow checks this table's column types; TS cannot reduce QB's generic constraints.
    const assignments =
      getAst(Query.insert<T, InsertRow<T>>(table, row as NativeRow<T>)).values ?? [];

    const keys = assignments.map((assignment) => assignment.columnName);

    if (keys.length === 0) throw new Error("DB.values requires at least one provided column");

    if (columns && (keys.length !== columns.length || columns.some((key) => !keys.includes(key)))) {
      throw new Error("DB.values rows must supply the same columns");
    }

    columns = keys;

    return Object.fromEntries(assignments.map(({ columnName, value }) => [columnName, value]));
  });

  return Query.values(bound);
}

export * as DBValues from "./db.values";
