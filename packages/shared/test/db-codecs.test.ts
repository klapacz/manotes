import { DatabaseSync } from "node:sqlite";
import { DateTime, Effect, Exit, Schema } from "effect";
import { Query } from "effect-qb";
import * as Sqlite from "effect-qb/sqlite";
import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { Tables } from "../src/db.tables";
import { DB } from "../src/db.service";
import { NoteSchema } from "../src/note.schema";
import { AttrsSchema } from "../src/attrs.schema";
import { SqliteJson } from "@manotes/effect-qb-sqlite/json";
import type { UnknownNodeJSON } from "../src/node-json";

describe("application column codecs", () => {
  it("accepts a single plain row, preserving defaults and undefined omissions", async () => {
    await withDatabase(async (database, executor) => {
      const createdAt = DateTime.makeUnsafe("2026-10-15T12:00:00.000Z");

      const [event] = await Effect.runPromise(
        executor.execute(
          Query.insert(Tables.events).pipe(
            Query.from(
              DB.values(Tables.events, {
                id: "single",
                noteId: "note",
                type: "update",
                payload: new Uint8Array([1, 2]),
                createdAt,
                commitSeq: undefined,
              }),
            ),
            Query.returning(Tables.events.columns),
          ),
        ),
      );

      expect(event!.localSeq).toBe(1);
      expect(event!.commitSeq).toBeNull();
      expect(DateTime.formatIso(event!.createdAt)).toBe(DateTime.formatIso(createdAt));
      expect(database.prepare("SELECT createdAt FROM events").get()).toEqual({
        createdAt: DateTime.formatIso(createdAt),
      });
    });
  });

  it("rejects empty batches and inconsistent columns before building SQL", () => {
    // @ts-expect-error Empty batches have no insertable rows.
    expect(() => DB.values(Tables.events, [])).toThrow("at least one row");
    expect(() => {
      return DB.values(Tables.events, [eventInput(), { ...eventInput(), commitSeq: 1 }]);
    }).toThrow("same columns");
  });

  it("encodes note writes and decodes returning, selected and nested rows", async () => {
    await withDatabase(async (database, executor) => {
      const createdAt = DateTime.makeUnsafe("2026-10-15T12:00:00.000Z");
      const content = { type: "doc", attrs: { pluginSpecific: ["kept", 42] } };

      const [inserted] = await Effect.runPromise(
        executor.execute(
          Query.insert(Tables.notes, {
            id: NoteSchema.Id.make("note"),
            title: null,
            content,
            text: "body",
            date: "2026-10-15",
            createdAt,
            updatedAt: createdAt,
            lastEventLocalSeq: 0,
          }).pipe(Query.returning(Tables.notes.columns)),
        ),
      );

      expectTypeOf(inserted!.id).toEqualTypeOf<NoteSchema.Id>();
      expectTypeOf(inserted!.createdAt).toEqualTypeOf<DateTime.Utc>();
      expectTypeOf(inserted!.content).toEqualTypeOf<UnknownNodeJSON>();
      expect(inserted!.content).toEqual(content);
      expect(DateTime.formatIso(inserted!.createdAt)).toBe(DateTime.formatIso(createdAt));
      expect(database.prepare("SELECT content, createdAt, updatedAt FROM notes").get()).toEqual({
        content: JSON.stringify(content),
        createdAt: DateTime.formatIso(createdAt),
        updatedAt: DateTime.formatIso(createdAt),
      });

      const updatedAt = DateTime.add(createdAt, { minutes: 1 });
      await Effect.runPromise(
        executor.execute(
          Query.update(Tables.notes, { updatedAt, title: undefined }).pipe(
            Query.where(Query.eq(Tables.notes.id, "note")),
          ),
        ),
      );

      const selection = Query.select({
        content: Tables.notes.content,
        updatedAt: Tables.notes.updatedAt,
      }).pipe(Query.from(Tables.notes));

      const json = SqliteJson.make({});

      const [row] = await Effect.runPromise(
        executor.execute(Query.select({ notes: json.jsonArrayFrom(selection) })),
      );

      expect(row!.notes[0]!.content).toEqual(content);
      expect(DateTime.formatIso(row!.notes[0]!.updatedAt)).toBe(DateTime.formatIso(updatedAt));
    });
  });

  it("parses content JSON without enforcing an editor document structure", async () => {
    await withDatabase(async (database, executor) => {
      const insert = database.prepare(`INSERT INTO notes
        (id, content, text, date, createdAt, updatedAt, lastEventLocalSeq)
        VALUES (?, ?, '', '2026-10-15', '2026-10-15', '2026-10-15', 0)`);

      const values = [{ arbitrary: true }, [], "text", null];

      for (const [index, value] of values.entries())
        insert.run(String(index), JSON.stringify(value));

      const rows = await Effect.runPromise(
        executor.execute(
          Query.select({ content: Tables.notes.content }).pipe(
            Query.from(Tables.notes),
            Query.orderBy(Tables.notes.id),
          ),
        ),
      );

      expect(rows.map((row) => row.content)).toEqual(values);
      database.exec("UPDATE notes SET content = 'not JSON' WHERE id = '0'");
      expect(
        Exit.isFailure(
          await Effect.runPromiseExit(
            executor.execute(
              Query.select({ content: Tables.notes.content }).pipe(Query.from(Tables.notes)),
            ),
          ),
        ),
      ).toBe(true);
    });
  });

  it("keeps BooleanFromBit storage and the existing integer filter", async () => {
    await withDatabase(async (database, executor) => {
      database.exec(`INSERT INTO notes
        (id, content, text, date, createdAt, updatedAt, lastEventLocalSeq)
        VALUES ('note', '{}', '', '2026-10-15', '2026-10-15', '2026-10-15', 0)`);
      await Effect.runPromise(executor.execute(Query.update(Tables.notes, { attrs_valid: true })));
      expect(database.prepare("SELECT attrs_valid FROM notes").get()).toEqual({ attrs_valid: 1 });
      expect(
        await Effect.runPromise(
          executor.execute(
            Query.select({ valid: Tables.notes.attrs_valid }).pipe(
              Query.from(Tables.notes),
              Query.where(Query.eq(Tables.notes.attrs_valid, 1)),
            ),
          ),
        ),
      ).toEqual([{ valid: true }]);
    });
  });

  it("uses column codecs for dates, binary and JSON in bulk VALUES", async () => {
    await withDatabase(async (database, executor) => {
      const createdAt = DateTime.makeUnsafe("2026-10-15T12:00:00.000Z");
      const payload = new Uint8Array([0, 1, 255]);

      const rows = ["one", "two"].map((id) => ({
        id,
        noteId: "note",
        type: Schema.Literal("update").make("update"),
        payload,
        createdAt,
      }));

      if (!rows[0]) throw new Error("Expected event fixtures");

      const events = await Effect.runPromise(
        executor.execute(
          Query.insert(Tables.events).pipe(
            Query.from(DB.values(Tables.events, [rows[0], ...rows.slice(1)])),
            Query.returning(Tables.events.columns),
          ),
        ),
      );

      expect(events).toHaveLength(2);
      expect(events[0]!.payload).toEqual(payload);
      expect(DateTime.formatIso(events[1]!.createdAt)).toBe(DateTime.formatIso(createdAt));
      expect(
        database.prepare("SELECT createdAt, hex(payload) AS bytes FROM events LIMIT 1").get(),
      ).toEqual({
        createdAt: DateTime.formatIso(createdAt),
        bytes: "0001FF",
      });

      const value = AttrsSchema.PropVal.cases.number.make({ val: 42 });
      await Effect.runPromise(
        executor.execute(
          Query.insert(Tables.props).pipe(
            Query.from(
              DB.values(Tables.props, [
                {
                  recordId: NoteSchema.Id.make("note"),
                  path: [NoteSchema.Id.make("rule")],
                  propId: NoteSchema.Id.make("number"),
                  value,
                },
                {
                  recordId: NoteSchema.Id.make("note"),
                  path: [],
                  propId: NoteSchema.Id.make("null"),
                  value: null,
                },
              ]),
            ),
          ),
        ),
      );
      expect(
        database.prepare("SELECT path, value FROM props WHERE propId = 'number'").get(),
      ).toEqual({
        path: '["rule"]',
        value: JSON.stringify(value),
      });
      expect(
        await Effect.runPromise(
          executor.execute(
            Query.select(Tables.props.columns).pipe(
              Query.from(Tables.props),
              Query.orderBy(Tables.props.propId),
            ),
          ),
        ),
      ).toEqual([
        { recordId: "note", path: [], propId: "null", value: null },
        { recordId: "note", path: ["rule"], propId: "number", value },
      ]);
    });
  });

  it("decodes rule expectations through columns and rejects invalid stored IDs", async () => {
    await withDatabase(async (database, executor) => {
      const expectation: Tables.RuleExpect = {
        ruleId: NoteSchema.Id.make("rule"),
        propId: NoteSchema.Id.make("prop"),
        value: AttrsSchema.RuleExpectation.cases.required.make({}),
      };

      const rows = await Effect.runPromise(
        executor.execute(
          Query.insert(Tables.ruleExpects).pipe(
            Query.from(DB.values(Tables.ruleExpects, expectation)),
            Query.returning(Tables.ruleExpects.columns),
          ),
        ),
      );

      expectTypeOf(rows[0]!.propId).toEqualTypeOf<NoteSchema.Id>();
      expect(rows).toEqual([expectation]);
      expect(database.prepare("SELECT value FROM rule_expects").get()).toEqual({
        value: '{"_tag":"required"}',
      });

      database.exec("UPDATE rule_expects SET propId = ''");
      expect(
        Exit.isFailure(
          await Effect.runPromiseExit(
            executor.execute(
              Query.select(Tables.ruleExpects.columns).pipe(Query.from(Tables.ruleExpects)),
            ),
          ),
        ),
      ).toBe(true);

      database.exec("INSERT INTO props VALUES ('', '[]', 'prop', NULL)");
      expect(
        Exit.isFailure(
          await Effect.runPromiseExit(
            executor.execute(Query.select(Tables.props.columns).pipe(Query.from(Tables.props))),
          ),
        ),
      ).toBe(true);
    });
  });

  it("rejects malformed stored dates and retains the content TEXT column", async () => {
    await withDatabase(async (database, executor) => {
      expect(
        database
          .prepare("SELECT type FROM pragma_table_info('notes') WHERE name = 'content'")
          .get(),
      ).toEqual({ type: "TEXT" });
      database.exec(
        "INSERT INTO events (noteId, type, payload, createdAt, id) VALUES ('note', 'update', x'00', 'bad date', 'bad')",
      );
      expect(
        Exit.isFailure(
          await Effect.runPromiseExit(
            executor.execute(Query.select(Tables.events.columns).pipe(Query.from(Tables.events))),
          ),
        ),
      ).toBe(true);
    });
  });
});

function checkValueTypes() {
  // @ts-expect-error Dates must be domain DateTime values.
  DB.values(Tables.events, { ...eventInput(), createdAt: "2026-10-15" });
  // @ts-expect-error Binary payloads must be Uint8Array values.
  DB.values(Tables.events, { ...eventInput(), payload: "bytes" });
  // @ts-expect-error Required event fields cannot be omitted.
  DB.values(Tables.events, { id: "incomplete" });
  // @ts-expect-error Unknown columns are rejected.
  DB.values(Tables.events, { ...eventInput(), typo: "unknown" });
  DB.values(Tables.props, {
    recordId: NoteSchema.Id.make("note"),
    path: [],
    propId: NoteSchema.Id.make("number"),
    value: {
      ...AttrsSchema.PropVal.cases.number.make({ val: 42 }),
      // @ts-expect-error JSON fields retain their schema's value types.
      val: "wrong",
    },
  });
}

void checkValueTypes;

function eventInput() {
  return {
    id: "event",
    noteId: "note",
    type: Schema.Literal("update").make("update"),
    payload: new Uint8Array([1, 2]),
    createdAt: DateTime.makeUnsafe("2026-10-15T12:00:00.000Z"),
  };
}

async function withDatabase(
  run: (database: DatabaseSync, executor: ReturnType<typeof makeExecutor>) => Promise<void>,
) {
  const database = new DatabaseSync(":memory:");
  const executor = makeExecutor(database);

  try {
    for (const table of [Tables.notes, Tables.events, Tables.props, Tables.ruleExpects])
      await Effect.runPromise(executor.execute(Query.createTable(table)));
    await run(database, executor);
  } finally {
    database.close();
  }
}

function makeExecutor(database: DatabaseSync) {
  return Sqlite.Executor.make({
    driver: Sqlite.Executor.driver((statement) => {
      return Effect.try(() => {
        return database
          .prepare(statement.sql)
          .all(...statement.params.map((value) => nativeParameter(value)));
      });
    }),
  });
}

const nativeParameter = Schema.decodeUnknownSync(
  Schema.Union([Schema.Null, Schema.String, Schema.Number, Schema.BigInt, Schema.Uint8Array]),
);
