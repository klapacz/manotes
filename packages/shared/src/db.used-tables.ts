import { Predicate, Record, Schema } from "effect";
import { ExpressionAst, QueryAst, Table } from "effect-qb";
import type { Plan } from "./db.service";

export function usedTables(plan: Plan): readonly string[] {
  const tables = new Set<string>();
  const visited = new WeakSet<object>();
  visit(plan);

  return [...tables];

  // oxlint-disable-next-line anti-slop/no-unknown-parameters -- Walk library-owned AST nodes; table metadata is decoded before use.
  function visit(value: unknown): void {
    if (!Predicate.isObjectKeyword(value) || visited.has(value)) return;
    visited.add(value);

    if (Table.TypeId in value) {
      // oxlint-disable-next-line anti-slop/no-reflect-get -- Table.TypeId loses its unique-symbol type upstream; decode the metadata immediately.
      tables.add(decodeTableMetadata(Reflect.get(value, Table.TypeId)).baseName);

      return;
    }

    if (QueryAst.TypeId in value) return visit(value[QueryAst.TypeId]);

    if (ExpressionAst.TypeId in value) return visit(value[ExpressionAst.TypeId]);

    for (const child of Record.values(value)) visit(child);
  }
}

const TableMetadata = Schema.Struct({ baseName: Schema.String });

const decodeTableMetadata = Schema.decodeUnknownSync(TableMetadata);

export * as DBUsedTables from "./db.used-tables";
