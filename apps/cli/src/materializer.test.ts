import { PaneSchema } from "@manotes/shared/note/pane.schema";
import { NodeServices } from "@effect/platform-node";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { DB } from "@manotes/shared/db.service";
import { EventRepo } from "@manotes/shared/event.repo";
import * as Materializer from "@manotes/shared/materializer.service";
import { MaterializerAttrs } from "@manotes/shared/materializer/attrs.service";
import { StreamFilter } from "@manotes/shared/note/stream-filter";
import { NoteRepo } from "@manotes/shared/note.repo";
import { DateTime, Effect, Layer, Result, Record, type Scope } from "effect";
import * as Reactivity from "effect/reactivity/Reactivity";
import { SqlClient } from "effect/sql";
import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";
import { CliRuntime } from "./cli.runtime";

describe("attrs materialization", () => {
  it("projects defaults for missing attrs without writing them into Yjs", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const doc = yield* makeDoc();
        const update = Y.encodeStateAsUpdate(doc);
        const event = yield* save(doc, "note");
        const sql = yield* SqlClient.SqlClient;

        expect(yield* sql`SELECT _tag AS tag, attrs_valid, prop_type FROM notes`).toEqual([
          { tag: "note", attrs_valid: 1, prop_type: null },
        ]);
        expect(yield* sql`SELECT * FROM props`).toEqual([]);
        expect(yield* sql`SELECT * FROM rule_expects`).toEqual([]);
        yield* expectSnapshot("note", update);
        expect(doc.getMap("attrs").toJSON()).toEqual({});
        expect(yield* sql`SELECT lastAppliedLocalSeq FROM materialization_checkpoint`).toEqual([
          { lastAppliedLocalSeq: event.localSeq },
        ]);
      }),
    );
  });

  it("projects loose fields and omits malformed map entries when strict attrs are invalid", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const doc = yield* makeDoc();
        const attrs = doc.getMap("attrs");
        attrs.set("_tag", 42);
        attrs.set("prop_type", "bool");
        const oldDefault = AttrsSchema.PropVal.cases.text.make({ val: "old default" });
        attrs.set("prop_default", oldDefault);
        attrs.set("prop_targets", [
          AttrsSchema.FilterExpr.make({
            // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- The recursive FilterExpr codec's make validates this general-stream predicate.
            _tag: "cmp",
            val: [["prop", AttrsSchema.NoteId.make("priority")], "invalid", true],
          }),
        ]);
        attrs.set("owned_type", "enum_option");
        attrs.set("owned_parent", "priority");
        attrs.set("rule_targets", []);
        const props = new Y.Map<unknown>();
        attrs.set("props", props);
        props.set("good", AttrsSchema.PropVal.cases.number.make({ val: 7 }));
        props.set("broken", { val: 1 });
        props.set("infinite", {
          ...AttrsSchema.PropVal.cases.number.make({ val: 1 }),
          val: Infinity,
        });
        props.set("toString", null);
        props.set("", AttrsSchema.PropVal.cases.bool.make({ val: true }));
        const expects = new Y.Map<unknown>();
        attrs.set("rule_expects", expects);
        expects.set("priority", AttrsSchema.RuleExpectation.cases.required.make({}));
        // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- Intentionally corrupt synchronized data.
        expects.set("broken", { _tag: "unknown" });
        const update = Y.encodeStateAsUpdate(doc);

        yield* save(doc, "corrupt");
        const sql = yield* SqlClient.SqlClient;
        expect(
          yield* sql`SELECT _tag AS tag, attrs_valid, prop_type,
          prop_default, prop_targets, owned_type, owned_parent, rule_targets FROM notes`,
        ).toEqual([
          {
            tag: "note",
            attrs_valid: 0,
            prop_type: "bool",
            prop_default: JSON.stringify(oldDefault),
            prop_targets: null,
            owned_type: "enum_option",
            owned_parent: "priority",
            rule_targets: "[]",
          },
        ]);
        expect(
          yield* sql`SELECT propId, json_extract(value, '$.val') AS val
            FROM props ORDER BY propId`,
        ).toEqual([{ propId: "good", val: 7 }]);
        expect(
          yield* sql`SELECT propId, json_extract(value, '$._tag') AS tag
          FROM rule_expects ORDER BY propId`,
        ).toEqual([{ propId: "priority", tag: "required" }]);
        yield* expectSnapshot("corrupt", update);
      }),
    );
  });

  it("replaces rows on updates and replay, and clears removed fields without touching other records", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const other = yield* makeDoc();
        const otherProps = new Y.Map<unknown>();
        other.getMap("attrs").set("props", otherProps);
        otherProps.set(
          "priority",
          AttrsSchema.PropVal.cases.enum.make({ val: AttrsSchema.NoteId.make("high") }),
        );
        yield* save(other, "other");

        const doc = yield* makeDoc();
        const attrs = doc.getMap("attrs");
        attrs.set("_tag", "rule");
        attrs.set("rule_storage", AttrsSchema.RuleStorage.cases.top.make({}));
        attrs.set("rule_targets", []);
        const props = new Y.Map<unknown>();
        attrs.set("props", props);
        props.set(
          "priority",
          AttrsSchema.PropVal.cases.enum.make({ val: AttrsSchema.NoteId.make("high") }),
        );
        props.set(
          "assignee",
          AttrsSchema.PropVal.cases.link.make({ val: AttrsSchema.NoteId.make("person") }),
        );
        const expects = new Y.Map<unknown>();
        attrs.set("rule_expects", expects);
        expects.set("priority", AttrsSchema.RuleExpectation.cases.required.make({}));
        expects.set("assignee", AttrsSchema.RuleExpectation.cases.optional.make({}));
        yield* save(doc, "rule");
        const sql = yield* SqlClient.SqlClient;
        expect(yield* sql`SELECT attrs_valid FROM notes WHERE id = 'rule'`).toEqual([
          { attrs_valid: 1 },
        ]);

        props.delete("assignee");
        props.set("priority", AttrsSchema.PropVal.cases.text.make({ val: "changed type" }));
        expects.delete("assignee");
        yield* save(doc, "rule");
        // Replay the same state through another event, exercising replacement twice.
        yield* save(doc, "rule");
        expect(
          yield* sql`SELECT recordId, propId, json_extract(value, '$._tag') AS tag
          FROM props ORDER BY recordId, propId`,
        ).toEqual([
          { recordId: "other", propId: "priority", tag: "enum" },
          { recordId: "rule", propId: "priority", tag: "text" },
        ]);
        expect(yield* sql`SELECT ruleId, propId FROM rule_expects`).toEqual([
          { ruleId: "rule", propId: "priority" },
        ]);

        attrs.set("props", "broken");
        attrs.set("rule_expects", "broken");
        yield* save(doc, "rule");
        expect(yield* sql`SELECT * FROM props WHERE recordId = 'rule'`).toEqual([]);
        expect(yield* sql`SELECT * FROM rule_expects`).toEqual([]);
        expect(yield* sql`SELECT attrs_valid FROM notes WHERE id = 'rule'`).toEqual([
          { attrs_valid: 0 },
        ]);

        attrs.set("_tag", "note");
        attrs.delete("rule_storage");
        attrs.delete("rule_targets");
        attrs.delete("rule_expects");
        attrs.delete("props");
        yield* save(doc, "rule");
        expect(yield* sql`SELECT recordId, propId FROM props`).toEqual([
          { recordId: "other", propId: "priority" },
        ]);
        expect(yield* sql`SELECT * FROM rule_expects`).toEqual([]);
        expect(
          yield* sql`SELECT _tag AS tag, rule_targets, attrs_valid FROM notes WHERE id = 'rule'`,
        ).toEqual([{ tag: "note", rule_targets: null, attrs_valid: 1 }]);
      }),
    );
  });

  it("projects independent paths and replaces grouped assignments without changing Yjs", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const doc = yield* makeDoc();
        const props = new Y.Map<unknown>();
        doc.getMap("attrs").set("props", props);
        props.set("priority", AttrsSchema.PropVal.cases.number.make({ val: 1 }));

        const groups = Record.map({ task: 2, other: 3, empty: undefined }, (value, id) => {
          const group = new Y.Map<unknown>();
          const values = new Y.Map<unknown>();
          group.set("_tag", "group");
          group.set("props", values);
          props.set(id, group);

          if (value !== undefined) {
            values.set("priority", AttrsSchema.PropVal.cases.number.make({ val: value }));
          }

          return values;
        });

        const update = Y.encodeStateAsUpdate(doc);
        yield* save(doc, "note");
        yield* save(doc, "note");
        const sql = yield* SqlClient.SqlClient;

        const rows = sql`SELECT path, propId, json_extract(value, '$.val') AS val
          FROM props ORDER BY path`;

        expect(yield* rows).toEqual([
          { path: '["other"]', propId: "priority", val: 3 },
          { path: '["task"]', propId: "priority", val: 2 },
          { path: "[]", propId: "priority", val: 1 },
        ]);
        expect(Y.encodeStateAsUpdate(doc)).toEqual(update);
        yield* expectSnapshot("note", update);

        groups.task.set("priority", AttrsSchema.PropVal.cases.number.make({ val: 4 }));
        groups.other.delete("priority");
        yield* save(doc, "note");
        expect(yield* rows).toEqual([
          { path: '["task"]', propId: "priority", val: 4 },
          { path: "[]", propId: "priority", val: 1 },
        ]);

        props.delete("task");
        yield* save(doc, "note");
        expect(yield* rows).toEqual([{ path: "[]", propId: "priority", val: 1 }]);
      }),
    );
  });

  it("projects rule storage as JSON or NULL without repairing missing or malformed Yjs values", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const doc = yield* makeDoc();
        const attrs = doc.getMap("attrs");
        const group = AttrsSchema.RuleStorage.cases.group.make({});
        const top = AttrsSchema.RuleStorage.cases.top.make({});
        attrs.set("_tag", "rule");
        attrs.set("rule_targets", []);
        attrs.set("rule_storage", group);
        attrs.set("props", new Y.Map());
        const expects = new Y.Map();
        attrs.set("rule_expects", expects);
        expects.set("priority", AttrsSchema.RuleExpectation.cases.required.make({}));
        yield* save(doc, "rule");
        const sql = yield* SqlClient.SqlClient;

        expect(yield* sql`SELECT rule_storage, attrs_valid FROM notes`).toEqual([
          { rule_storage: JSON.stringify(group), attrs_valid: 1 },
        ]);

        attrs.delete("rule_storage");
        yield* save(doc, "rule");
        expect(yield* sql`SELECT rule_storage, attrs_valid FROM notes`).toEqual([
          { rule_storage: null, attrs_valid: 0 },
        ]);
        expect(attrs.has("rule_storage")).toBe(false);

        attrs.set("rule_storage", "broken");
        const malformedUpdate = Y.encodeStateAsUpdate(doc);
        yield* save(doc, "rule");
        expect(yield* sql`SELECT rule_storage, attrs_valid FROM notes`).toEqual([
          { rule_storage: null, attrs_valid: 0 },
        ]);
        expect(attrs.get("rule_storage")).toBe("broken");
        yield* expectSnapshot("rule", malformedUpdate);

        attrs.set("rule_storage", top);
        yield* save(doc, "rule");
        expect(yield* sql`SELECT rule_storage, attrs_valid FROM notes`).toEqual([
          { rule_storage: JSON.stringify(top), attrs_valid: 1 },
        ]);
        expect(yield* sql`SELECT ruleId, propId FROM rule_expects`).toEqual([
          { ruleId: "rule", propId: "priority" },
        ]);
      }),
    );
  });

  it("rolls back columns, both linking tables and the checkpoint when a query fails", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const doc = yield* makeDoc();
        const attrs = doc.getMap("attrs");
        attrs.set("_tag", "rule");
        attrs.set("rule_storage", AttrsSchema.RuleStorage.cases.top.make({}));
        attrs.set("rule_targets", []);
        const props = new Y.Map<unknown>();
        attrs.set("props", props);
        props.set("priority", AttrsSchema.PropVal.cases.bool.make({ val: false }));
        const expects = new Y.Map<unknown>();
        attrs.set("rule_expects", expects);
        expects.set("priority", AttrsSchema.RuleExpectation.cases.optional.make({}));
        yield* save(doc, "rule");
        const sql = yield* SqlClient.SqlClient;
        const beforeNotes = yield* sql`SELECT * FROM notes`;
        const beforeProps = yield* sql`SELECT * FROM props`;
        const beforeExpects = yield* sql`SELECT * FROM rule_expects`;
        const beforeCheckpoint = yield* sql`SELECT * FROM materialization_checkpoint`;

        const targets = StreamFilter.toAttrs({
          type: PaneSchema.StreamFilterType.cases.pages.make({}),
        });

        attrs.set("rule_targets", targets);
        props.set("priority", AttrsSchema.PropVal.cases.bool.make({ val: true }));
        expects.set("priority", AttrsSchema.RuleExpectation.cases.required.make({}));
        yield* appendEvent(doc, "rule");
        yield* sql`CREATE TEMP TRIGGER reject_expect BEFORE INSERT ON rule_expects
          BEGIN SELECT RAISE(ABORT, 'forced failure'); END`;
        const attrsService = yield* MaterializerAttrs.Service;

        const directFailure = yield* attrsService
          .materialize({
            recordId: AttrsSchema.NoteId.make("rule"),
            yDoc: doc,
          })
          .pipe(Effect.result);

        expect(Result.isFailure(directFailure)).toBe(true);
        expect(yield* sql`SELECT * FROM notes`).toEqual(beforeNotes);
        expect(yield* sql`SELECT * FROM props`).toEqual(beforeProps);
        expect(yield* sql`SELECT * FROM rule_expects`).toEqual(beforeExpects);

        const materializer = yield* Materializer.Service;
        const failed = yield* materializer.catchUp().pipe(Effect.result);
        expect(Result.isFailure(failed)).toBe(true);
        expect(yield* sql`SELECT * FROM notes`).toEqual(beforeNotes);
        expect(yield* sql`SELECT * FROM props`).toEqual(beforeProps);
        expect(yield* sql`SELECT * FROM rule_expects`).toEqual(beforeExpects);
        expect(yield* sql`SELECT * FROM materialization_checkpoint`).toEqual(beforeCheckpoint);

        yield* sql`DROP TRIGGER reject_expect`;
        yield* materializer.catchUp();
        expect(yield* sql`SELECT rule_targets FROM notes`).toEqual([
          {
            rule_targets: JSON.stringify(targets),
          },
        ]);
        expect(yield* sql`SELECT json_extract(value, '$.val') AS val FROM props`).toEqual([
          { val: 1 },
        ]);
        expect(yield* sql`SELECT json_extract(value, '$._tag') AS tag FROM rule_expects`).toEqual([
          { tag: "required" },
        ]);
      }),
    );
  });
});

function makeDoc() {
  return Effect.acquireRelease(
    Effect.sync(() => new Y.Doc()),
    (doc) => Effect.sync(() => doc.destroy()),
  );
}

function appendEvent(doc: Y.Doc, noteId: string) {
  return Effect.gen(function* () {
    const repo = yield* EventRepo.Service;

    return yield* repo.create({
      noteId,
      type: "update",
      payload: Y.encodeStateAsUpdate(doc),
      createdAt: yield* DateTime.now,
    });
  });
}

function save(doc: Y.Doc, noteId: string) {
  return Effect.gen(function* () {
    const event = yield* appendEvent(doc, noteId);
    const materializer = yield* Materializer.Service;
    yield* materializer.catchUp();

    return event;
  });
}

function expectSnapshot(noteId: string, update: Uint8Array<ArrayBufferLike>) {
  return Effect.gen(function* () {
    const repo = yield* NoteRepo.Service;
    const note = yield* repo.getById(noteId);
    expect(note.materializedYUpdate).toEqual(update);
  });
}

function runIntegration(
  program: Effect.Effect<
    void,
    unknown,
    | DB.Service
    | EventRepo.Service
    | Materializer.Service
    | MaterializerAttrs.Service
    | NoteRepo.Service
    | SqlClient.SqlClient
    | Scope.Scope
  >,
) {
  return Effect.runPromise(
    program.pipe(
      Effect.provide(MaterializerAttrs.Service.layer.pipe(Layer.provideMerge(CliRuntime.layer))),
      Effect.provide(Layer.succeed(DB.Config, { localGraphId: "test", databasePath: ":memory:" })),
      Effect.provide(NodeServices.layer),
      Effect.provide(Reactivity.layer),
      Effect.scoped,
    ),
  );
}
