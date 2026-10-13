import { Query, Table } from "effect-qb";
import { describe, expect, it } from "vite-plus/test";
import { Tables } from "./db.tables";
import { DBUsedTables } from "./db.used-tables";
import { NoteFilter } from "./note/filter";
import { BuiltinAttrs } from "./builtin-attrs";
import { AttrsSchema } from "./attrs.schema";
import type { DB } from "./db.service";

describe("query table dependencies", () => {
  it("deduplicates aliases using the physical table name", () => {
    const other = Table.alias(Tables.notes, "other");

    const plan = Query.select({ id: Tables.notes.id }).pipe(
      Query.from(Tables.notes),
      Query.innerJoin(other, Query.eq(other.id, Tables.notes.id)),
    );

    expect(DBUsedTables.usedTables(plan)).toEqual(["notes"]);
  });

  it("includes property definitions, assignments, links, and fragment expressions", () => {
    const plan = Query.select({ id: Tables.notes.id }).pipe(
      Query.from(Tables.notes),
      Query.where(
        NoteFilter.filterPredicate({
          sort: "updated",
          props: {
            [BuiltinAttrs.archivedId]: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            [AttrsSchema.NoteId.make("priority")]: AttrsSchema.PropVal.cases.number.make({
              val: 7,
            }),
          },
          search: "50%_!",
          backlinksTo: "project",
          linksFrom: "source",
        }),
      ),
    );

    expect(DBUsedTables.usedTables(plan).toSorted()).toEqual(["backlinks", "notes", "props"]);
  });

  it("follows derived sources and CTEs to their physical tables", () => {
    const links = Query.as(
      Query.select({ id: Tables.backlinks.sourceId }).pipe(Query.from(Tables.backlinks)),
      "links",
    );

    const linkedNotes = Query.with(
      Query.select({ id: Tables.notes.id }).pipe(
        Query.from(Tables.notes),
        Query.innerJoin(links, Query.eq(links.id, Tables.notes.id)),
      ),
      "linked_notes",
    );

    const plan = Query.select({ id: linkedNotes.id }).pipe(Query.from(linkedNotes));

    expect(DBUsedTables.usedTables(plan).toSorted()).toEqual(["backlinks", "notes"]);
  });
});

// Compiled by vp check; never invoked. Cover the adapter and compatibility patch's type checks.
function typeChecks(db: (typeof DB.Service)["Service"]) {
  // @ts-expect-error the query references props without declaring a source
  db.query(Query.select({ id: Tables.props.recordId }));
  // @ts-expect-error reactive queries also reject incomplete plans
  db.reactiveQuery(Query.select({ id: Tables.props.recordId }));
  // @ts-expect-error text columns cannot be compared to numbers
  Query.eq(Tables.notes.text, 7);
  // @ts-expect-error JSON paths must exist in the schema
  void Tables.props.value.missing;
  // @ts-expect-error mutation values must match the column's runtime type
  Query.update(Tables.notes, { content: 7 });
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
  db.execute(Query.update(Tables.notes, { content: { type: "doc" }, title: undefined }));
}

void typeChecks;
