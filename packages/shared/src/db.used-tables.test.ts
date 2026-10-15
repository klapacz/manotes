import { RecordSchema } from "./record.schema";
import { Query, Table } from "effect-qb";
import { describe, expect, it } from "vite-plus/test";
import { Tables } from "./db.tables";
import { DBUsedTables } from "./db.used-tables";
import { RecordFilter } from "./record/filter";
import { BuiltinAttrs } from "./builtin-attrs";
import { AttrsSchema } from "./attrs.schema";
import type { DB } from "./db.service";

describe("query table dependencies", () => {
  it("deduplicates aliases using the physical table name", () => {
    const other = Table.alias(Tables.records, "other");

    const plan = Query.select({ id: Tables.records.id }).pipe(
      Query.from(Tables.records),
      Query.innerJoin(other, Query.eq(other.id, Tables.records.id)),
    );

    expect(DBUsedTables.usedTables(plan)).toEqual(["records"]);
  });

  it("includes property definitions, assignments, links, and fragment expressions", () => {
    const plan = Query.select({ id: Tables.records.id }).pipe(
      Query.from(Tables.records),
      Query.where(
        RecordFilter.filterPredicate([
          AttrsSchema.makeFilterExpr.cmp({
            val: [
              ["prop", BuiltinAttrs.archivedId],
              "=",
              AttrsSchema.PropVal.cases.bool.make({ val: false }),
            ],
          }),
          AttrsSchema.makeFilterExpr.cmp({
            val: [
              ["prop", AttrsSchema.RecordId.make("priority")],
              "=",
              AttrsSchema.PropVal.cases.number.make({ val: 7 }),
            ],
          }),
          AttrsSchema.makeFilterExpr.cmp({ val: ["body", "contains", "50%_!"] }),
          AttrsSchema.makeFilterExpr.cmp({
            val: [["link", "->", RecordSchema.Id.make("project")], "exists", true],
          }),
          AttrsSchema.makeFilterExpr.cmp({
            val: [["link", "<-", RecordSchema.Id.make("source")], "exists", true],
          }),
        ]),
      ),
    );

    expect(DBUsedTables.usedTables(plan).toSorted()).toEqual(["backlinks", "props", "records"]);
  });

  it("follows derived sources and CTEs to their physical tables", () => {
    const links = Query.as(
      Query.select({ id: Tables.backlinks.sourceId }).pipe(Query.from(Tables.backlinks)),
      "links",
    );

    const linkedRecords = Query.with(
      Query.select({ id: Tables.records.id }).pipe(
        Query.from(Tables.records),
        Query.innerJoin(links, Query.eq(links.id, Tables.records.id)),
      ),
      "linked_records",
    );

    const plan = Query.select({ id: linkedRecords.id }).pipe(Query.from(linkedRecords));

    expect(DBUsedTables.usedTables(plan).toSorted()).toEqual(["backlinks", "records"]);
  });
});

// Compiled by vp check; never invoked. Cover the adapter and compatibility patch's type checks.
function typeChecks(db: (typeof DB.Service)["Service"]) {
  // @ts-expect-error the query references props without declaring a source
  db.query(Query.select({ id: Tables.props.recordId }));
  // @ts-expect-error reactive queries also reject incomplete plans
  db.reactiveQuery(Query.select({ id: Tables.props.recordId }));
  // @ts-expect-error text columns cannot be compared to numbers
  Query.eq(Tables.records.text, 7);
  // @ts-expect-error JSON paths must exist in the schema
  void Tables.props.value.missing;
  // @ts-expect-error mutation values must match the column's runtime type
  Query.update(Tables.records, { content: 7 });
  // @ts-expect-error undefined cannot omit a required insert column
  Query.insert(Tables.materializationCheckpoint, {
    id: 1,
    lastAppliedLocalSeq: undefined,
    updatedAt: "now",
  });

  const insert = Query.insert(Tables.materializationCheckpoint, {
    id: 1,
    lastAppliedLocalSeq: 4,
    updatedAt: "now",
  });

  // @ts-expect-error conflict columns must be a declared unique key
  insert.pipe(Query.onConflict("updatedAt"));
  db.execute(insert.pipe(Query.onConflict("id")));
  db.execute(Query.update(Tables.records, { content: { type: "doc" }, title: undefined }));
}

void typeChecks;
