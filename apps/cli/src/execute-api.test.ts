import { PropDef } from "@manotes/shared/prop-def.service";
import { RuleRecord } from "@manotes/shared/rule-record.service";
import { Attrs } from "@manotes/shared/attrs.service";
import { RecordSchema } from "@manotes/shared/record.schema";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NodeServices } from "@effect/platform-node";
import dedent from "dedent";
import { Console, DateTime, Effect, type FileSystem, Layer, Result } from "effect";
import { Query } from "effect-qb";
import { Tables } from "@manotes/shared/db.tables";
import { Reactivity } from "effect/reactivity";
import { describe, expect, it } from "vite-plus/test";
import { initProseMirrorDoc, prosemirrorJSONToYDoc, updateYFragment } from "y-prosemirror";
import * as Y from "yjs";
import { DB } from "@manotes/shared/db.service";
import { EventRepo } from "@manotes/shared/event.repo";
import { Materializer } from "@manotes/shared/materializer.service";
import type { UnknownNodeJSON } from "@manotes/shared/node-json";
import { EventSchema } from "@manotes/shared/event.schema";
import { RecordRepo } from "@manotes/shared/record.repo";
import { RECORD_SCHEMA } from "@manotes/shared/prosemirror/app-schema";
import { toLocalDateString } from "@manotes/shared/temporal/utils";
import { MdParse } from "@manotes/shared/prosemirror/md/parse";
import { MdSerialize } from "@manotes/shared/prosemirror/md/serialize";
import {
  getProsemirrorXmlFragment,
  PROSEMIRROR_XML_FRAGMENT_KEY,
} from "@manotes/shared/prosemirror/yjs";
import { CliRuntime } from "./cli.runtime";
import { CliExecute } from "./cli.execute";
import { BacklinkLabels } from "@manotes/shared/backlink-labels";
import { CliList } from "@manotes/shared/list";
import { ExecuteApi } from "@manotes/shared/execute-api";
import { RecordDoc } from "@manotes/shared/record/doc";
import { YSchema } from "@manotes/shared/y-schema";

const RECORD_ID = RecordSchema.Id.make("record-1");

const INITIAL_MARKDOWN = dedent`
  # Plan

  Alpha.
`;

type RuntimeServices =
  | DB.Service
  | EventRepo.Service
  | Materializer.Service
  | RecordRepo.Service
  | FileSystem.FileSystem
  | PropDef.Service
  | RuleRecord.Service
  | Attrs.Service;

describe("ExecuteApi.editRecord", () => {
  it("saves a date event without changing content, and skips unchanged or cancelling dates", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedRecord(RECORD_ID, INITIAL_MARKDOWN);
        const recordRepo = yield* RecordRepo.Service;
        const eventRepo = yield* EventRepo.Service;
        const before = yield* recordRepo.getById(RECORD_ID);

        yield* runTestScript(dedent`
          await api.editRecord("${RECORD_ID}", [{ kind: "date.set", date: "2024-02-29" }]);
        `);

        const after = yield* recordRepo.getById(RECORD_ID);
        expect(after.date).toBe("2024-02-29");
        expect(after.content).toEqual(before.content);
        expect(after.materializedYUpdate).toEqual(before.materializedYUpdate);
        expect(after.createdAt).toEqual(before.createdAt);
        const pending = yield* eventRepo.findPending(10);
        expect(pending).toHaveLength(1);
        const event = pending[0];

        if (!event) throw new Error("Expected a date event");
        expect(event.type).toBe("date");
        expect(yield* EventSchema.decodeDatePayload(Uint8Array.from(event.payload))).toEqual({
          date: "2024-02-29",
        });
        expect(after.updatedAt).toEqual(event.createdAt);

        yield* runTestScript(dedent`
          await api.editRecord("${RECORD_ID}", [{ kind: "date.set", date: "2024-02-29" }]);
          await api.editRecord("${RECORD_ID}", [
            { kind: "date.set", date: "2025-01-01" },
            { kind: "date.set", date: "2024-02-29" },
          ]);
        `);
        expect(yield* eventRepo.countPending()).toBe(1);
        expect(yield* recordRepo.getById(RECORD_ID)).toEqual(after);
      }),
    );
  });

  it("saves mixed edits using only the last date, ignoring an invalid earlier date", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedRecord(RECORD_ID, INITIAL_MARKDOWN);
        yield* runTestScript(dedent`
          await api.editRecord("${RECORD_ID}", [
            { kind: "date.set", date: "2025-02-29" },
            { kind: "body.replace", text: "Alpha", with: "Beta" },
            { kind: "date.set", date: "2024-02-29" },
          ]);
        `);
        const recordRepo = yield* RecordRepo.Service;
        const eventRepo = yield* EventRepo.Service;
        const record = yield* recordRepo.getById(RECORD_ID);
        expect(record.date).toBe("2024-02-29");
        expect(markdownFromContent(record.content)).toBe("# Plan\n\nBeta.\n");
        expect((yield* eventRepo.findPending(10)).map((event) => event.type)).toEqual([
          "update",
          "date",
        ]);
      }),
    );
  });

  it("rejects an invalid final date, and rolls back dates when body edits fail", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedRecord(RECORD_ID, INITIAL_MARKDOWN);
        const recordRepo = yield* RecordRepo.Service;
        const eventRepo = yield* EventRepo.Service;
        const before = yield* recordRepo.getById(RECORD_ID);

        for (const edits of [
          [
            { kind: "body.replace", text: "Alpha", with: "Beta" },
            { kind: "date.set", date: "2024-02-29" },
            { kind: "date.set", date: "2025-02-29" },
          ],
          [
            { kind: "date.set", date: "2024-02-29" },
            { kind: "body.replace", text: "missing", with: "never saved" },
          ],
        ]) {
          const result = yield* runTestScript(dedent`
            await api.editRecord("${RECORD_ID}", ${JSON.stringify(edits)});
          `).pipe(Effect.result);

          expect(Result.isFailure(result)).toBe(true);
          expect(yield* eventRepo.countPending()).toBe(0);
          expect(yield* recordRepo.getById(RECORD_ID)).toEqual(before);
        }
      }),
    );
  });

  it("matches exported backlink labels and preserves their destination IDs", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedRecord(RecordSchema.Id.make("linked-record"), "# Manotes");
        yield* seedRecord(
          RECORD_ID,
          "Sync [Manotes](./linked-record.md) and [missing](./missing.md).",
          2,
        );
        const recordRepo = yield* RecordRepo.Service;
        const labels = BacklinkLabels.buildCache(yield* recordRepo.findAllNotes());
        const record = yield* recordRepo.getById(RECORD_ID);

        const exported = MdSerialize.serialize(RECORD_SCHEMA.nodeFromJSON(record.content), {
          backlinkLabel: (id) => labels.get(id),
        });

        expect(exported).toBe("Sync [Manotes](./linked-record.md) and [missing](./missing.md).\n");

        yield* runTestScript(dedent`
          await api.editRecord("${RECORD_ID}", [{
            kind: "body.replace",
            text: ${JSON.stringify(exported.trimEnd())},
            with: ${JSON.stringify(`- [ ] ${exported.trimEnd()}`)},
          }]);
        `);

        const updated = yield* recordRepo.getById(RECORD_ID);
        expect(markdownFromContent(updated.content)).toBe(
          "- [ ] Sync [linked-record](./linked-record.md) and [missing](./missing.md).\n",
        );
      }),
    );
  });

  it("exposes editing and creation and writes one event for an ordered edit batch", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedRecord(RECORD_ID, INITIAL_MARKDOWN);
        const eventRepo = yield* EventRepo.Service;
        const recordRepo = yield* RecordRepo.Service;

        expect(yield* eventRepo.countPending()).toBe(0);

        yield* runTestScript(dedent`
          if (Object.keys(api).sort().join(",") !== "createRecord,editRecord,list,listProps,showList") throw new Error("unexpected API");
          await api.editRecord("${RECORD_ID}", [
            { kind: "body.replace", text: "Alpha", with: "Beta" },
            { kind: "body.append", markdown: "Beta follows." },
            { kind: "body.replace", text: "Beta", with: "Done", occurrence: "all" },
          ]);
        `);

        const events = yield* eventRepo.findUpdatesForRecord(RECORD_ID);
        const record = yield* recordRepo.getById(RECORD_ID);

        const expected = `${dedent`
          # Plan

          Done.

          Done follows.
        `}\n`;

        expect(events).toHaveLength(2);
        expect(yield* eventRepo.countPending()).toBe(1);
        expect(markdownFromContent(record.content)).toBe(expected);
        expect(markdownAfterReplay(events.map((event) => event.payload))).toBe(expected);
        expect(stateVectorAfterReplay(events.map((event) => event.payload))).toEqual(
          stateVectorAfterReplay([requireSnapshot(record.materializedYUpdate)]),
        );
        yield* eventRepo.markCommitted({ eventId: events[1]!.id, commitSeq: 2 });
        expect(yield* eventRepo.countPending()).toBe(0);
      }),
    );
  });

  it("lets sequential calls edit the latest materialized content", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedRecord(RECORD_ID, INITIAL_MARKDOWN);
        const eventRepo = yield* EventRepo.Service;
        const recordRepo = yield* RecordRepo.Service;

        yield* runTestScript(dedent`
          await api.editRecord("${RECORD_ID}", [{ kind: "body.replace", text: "Alpha", with: "Beta" }]);
          await api.editRecord("${RECORD_ID}", [{ kind: "body.replace", text: "Beta", with: "Gamma" }]);
        `);

        const events = yield* eventRepo.findUpdatesForRecord(RECORD_ID);
        const record = yield* recordRepo.getById(RECORD_ID);

        expect(events).toHaveLength(3);
        expect(markdownFromContent(record.content)).toBe(
          `${dedent`
          # Plan

          Gamma.
        `}\n`,
        );
      }),
    );
  });

  it("serializes concurrent calls without losing either edit", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedRecord(RECORD_ID, INITIAL_MARKDOWN);
        const eventRepo = yield* EventRepo.Service;
        const recordRepo = yield* RecordRepo.Service;

        yield* runTestScript(dedent`
          await Promise.all([
            api.editRecord("${RECORD_ID}", [{ kind: "body.append", markdown: "First concurrent append." }]),
            api.editRecord("${RECORD_ID}", [{ kind: "body.append", markdown: "Second concurrent append." }]),
          ]);
        `);

        const events = yield* eventRepo.findUpdatesForRecord(RECORD_ID);
        const markdown = markdownFromContent((yield* recordRepo.getById(RECORD_ID)).content);

        expect(events).toHaveLength(3);
        expect(markdown).toContain("First concurrent append.\n");
        expect(markdown).toContain("Second concurrent append.\n");
      }),
    );
  });

  it("does not write events for no-op or cancelling edits", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedRecord(RECORD_ID, INITIAL_MARKDOWN);
        const eventRepo = yield* EventRepo.Service;
        const recordRepo = yield* RecordRepo.Service;

        yield* runTestScript(dedent`
          await api.editRecord("${RECORD_ID}", [{ kind: "body.replace", text: "Alpha", with: "Alpha" }]);
          await api.editRecord("${RECORD_ID}", [
            { kind: "body.replace", text: "Alpha", with: "Beta" },
            { kind: "body.replace", text: "Beta", with: "Alpha" },
          ]);
        `);

        expect(yield* eventRepo.findUpdatesForRecord(RECORD_ID)).toHaveLength(1);
        expect(markdownFromContent((yield* recordRepo.getById(RECORD_ID)).content)).toBe(
          `${INITIAL_MARKDOWN}\n`,
        );
      }),
    );
  });

  it("rolls back the whole batch when a later edit fails", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedRecord(RECORD_ID, INITIAL_MARKDOWN);
        const eventRepo = yield* EventRepo.Service;
        const recordRepo = yield* RecordRepo.Service;

        const result = yield* runTestScript(dedent`
          await api.editRecord("${RECORD_ID}", [
            { kind: "body.replace", text: "Alpha", with: "Beta" },
            { kind: "body.replace", text: "missing", with: "never saved" },
          ]);
        `).pipe(Effect.result);

        expect(Result.isFailure(result)).toBe(true);

        if (Result.isFailure(result)) expect(String(result.failure)).toMatch(/found 0/);

        expect(yield* eventRepo.findUpdatesForRecord(RECORD_ID)).toHaveLength(1);
        expect(markdownFromContent((yield* recordRepo.getById(RECORD_ID)).content)).toBe(
          `${INITIAL_MARKDOWN}\n`,
        );
      }),
    );
  });

  it("catches up an unmaterialized event before editing", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const seeded = yield* seedRecord(RECORD_ID, INITIAL_MARKDOWN);
        const eventRepo = yield* EventRepo.Service;
        const recordRepo = yield* RecordRepo.Service;

        const pendingMarkdown = dedent`
          # Plan

          Remote pending.
        `;

        const pending = yield* eventRepo.create({
          recordId: RECORD_ID,
          type: "update",
          payload: deltaFromMarkdown(seeded.update, pendingMarkdown),
          createdAt: yield* DateTime.now,
        });

        expect((yield* recordRepo.getById(RECORD_ID)).lastEventLocalSeq).toBe(seeded.localSeq);

        yield* runTestScript(dedent`
          await api.editRecord("${RECORD_ID}", [
            { kind: "body.replace", text: "Remote pending", with: "Caught up" },
          ]);
        `);

        const events = yield* eventRepo.findUpdatesForRecord(RECORD_ID);
        const record = yield* recordRepo.getById(RECORD_ID);

        expect(events).toHaveLength(3);
        expect(record.lastEventLocalSeq).toBeGreaterThan(pending.localSeq);
        expect(markdownFromContent(record.content)).toBe(
          `${dedent`
          # Plan

          Caught up.
        `}\n`,
        );
      }),
    );
  });
});

describe("ExecuteApi prop operations", () => {
  it("materializes mixed edits, all value types and grouped assignments and replays the event", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedRecord(RECORD_ID, INITIAL_MARKDOWN);

        yield* runTestScript(`
        await api.editRecord("${RECORD_ID}", [
          { kind: "body.replace", text: "Alpha", with: "Beta" },
          { kind: "date.set", date: "2024-02-29" },
          { kind: "prop.set", propId: "builtin:archived", value: { _tag: "bool", val: true } },
          { kind: "prop.set", propId: "caption", value: { _tag: "text", val: "hello" } },
          { kind: "prop.set", propId: "priority", value: { _tag: "number", val: 2 } },
          { kind: "prop.set", propId: "status", value: { _tag: "enum", val: "foreign-option" } },
          { kind: "prop.set", propId: "related", value: { _tag: "link", val: "missing-target" } },
          { kind: "prop.set", propId: "priority", ruleId: "task", value: { _tag: "number", val: 3 } },
        ]);
        const [record] = await api.list({ filter: [{ _tag: "cmp", val: ["id", "=", "${RECORD_ID}"] }] });
        if (record.date !== "2024-02-29" || !record.markdown.includes("Beta")) throw new Error("body/date visibility");
        const archived = record.props.top.find(prop => prop.propId === "builtin:archived");
        if (archived.value.state.value.val !== true) throw new Error("top prop visibility");
        const group = record.props.groups.find(group => group.ruleId === "task");
        if (group.props[0].value.state.value.val !== 3) throw new Error("group prop visibility");
      `);

        const records = yield* RecordRepo.Service;
        const events = yield* EventRepo.Service;
        const db = yield* DB.Service;
        const record = yield* records.getById(RECORD_ID);
        expect(record.date).toBe("2024-02-29");
        expect(record.text).toContain("Beta");
        expect((yield* events.findPending(10)).map((event) => event.type)).toEqual([
          "update",
          "date",
        ]);

        const rows = yield* db.query(
          Query.select(Tables.props.columns).pipe(
            Query.from(Tables.props),
            Query.where(Query.eq(Tables.props.recordId, RECORD_ID)),
          ),
        );

        expect(rows).toHaveLength(6);
        expect(rows).toEqual(
          expect.arrayContaining([
            {
              recordId: RECORD_ID,
              path: [],
              propId: "priority",
              value: AttrsSchema.PropVal.cases.number.make({ val: 2 }),
            },
            {
              recordId: RECORD_ID,
              path: ["task"],
              propId: "priority",
              value: AttrsSchema.PropVal.cases.number.make({ val: 3 }),
            },
          ]),
        );

        const updates = yield* events.findUpdatesForRecord(RECORD_ID);
        expect(updates).toHaveLength(2);
        const doc = replay(updates.map((event) => event.payload));

        try {
          const saved = yield* YSchema.exportLoose(RecordDoc.fromDoc({ doc }).attrs);
          expect(saved.props).toEqual({
            "builtin:archived": AttrsSchema.PropVal.cases.bool.make({ val: true }),
            caption: AttrsSchema.PropVal.cases.text.make({ val: "hello" }),
            priority: AttrsSchema.PropVal.cases.number.make({ val: 2 }),
            status: AttrsSchema.PropVal.cases.enum.make({
              val: RecordSchema.Id.make("foreign-option"),
            }),
            related: AttrsSchema.PropVal.cases.link.make({
              val: RecordSchema.Id.make("missing-target"),
            }),
            task: AttrsSchema.PropGroup.make({
              props: {
                [RecordSchema.Id.make("priority")]: AttrsSchema.PropVal.cases.number.make({
                  val: 3,
                }),
              },
            }),
          });
        } finally {
          doc.destroy();
        }
      }),
    );
  });

  it("keeps events for repeated and cancelling prop edits and clears assignments in order", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedRecord(RECORD_ID, INITIAL_MARKDOWN);
        const records = yield* RecordRepo.Service;
        const before = yield* records.getById(RECORD_ID);

        yield* runTestScript(`
        for (let i = 0; i < 2; i++) {
          await api.editRecord("${RECORD_ID}", [
            { kind: "prop.set", propId: "builtin:archived", value: { _tag: "bool", val: true } },
          ]);
        }
        await api.editRecord("${RECORD_ID}", [
          { kind: "prop.set", propId: "temporary", ruleId: "task", value: { _tag: "text", val: "temporary" } },
          { kind: "prop.clear", propId: "temporary", ruleId: "task" },
          { kind: "prop.clear", propId: "builtin:archived" },
        ]);
      `);

        const events = yield* EventRepo.Service;
        const db = yield* DB.Service;
        expect(yield* events.countPending()).toBe(3);
        expect(yield* events.findUpdatesForRecord(RECORD_ID)).toHaveLength(4);
        expect((yield* records.getById(RECORD_ID)).content).toEqual(before.content);
        expect(
          yield* db.query(
            Query.select(Tables.props.columns).pipe(
              Query.from(Tables.props),
              Query.where(Query.eq(Tables.props.recordId, RECORD_ID)),
            ),
          ),
        ).toEqual([]);
      }),
    );
  });

  it("creates prop-only records with grouped values and can clear them immediately", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* runTestScript(`
        const id = await api.createRecord("created-props", [
          { kind: "prop.set", propId: "builtin:archived", value: { _tag: "bool", val: true } },
          { kind: "prop.set", propId: "priority", ruleId: "task", value: { _tag: "number", val: 4 } },
        ]);
        const [created] = await api.list({ filter: [{ _tag: "cmp", val: ["id", "=", id] }] });
        if (created.props.groups[0].props[0].value.state.value.val !== 4) throw new Error("created prop visibility");
        await api.editRecord(id, [
          { kind: "prop.clear", propId: "builtin:archived" },
          { kind: "prop.clear", propId: "priority", ruleId: "task" },
        ]);
        const [cleared] = await api.list({ filter: [{ _tag: "cmp", val: ["id", "=", id] }] });
        if (cleared.props.top.length || cleared.props.groups.length) throw new Error("clear visibility");
      `);

        const records = yield* RecordRepo.Service;
        const events = yield* EventRepo.Service;
        const record = yield* records.getById(RecordSchema.Id.make("created-props"));
        expect(RECORD_SCHEMA.nodeFromJSON(record.content).firstChild?.type.name).toBe("paragraph");
        expect(record.text).toBe("");
        expect((yield* events.findPending(10)).map((event) => event.type)).toEqual([
          "update",
          "date",
          "update",
        ]);
      }),
    );
  });

  it("rolls back mixed batches on self-assignment and scalar/group collisions", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedRecord(RECORD_ID, INITIAL_MARKDOWN);
        const records = yield* RecordRepo.Service;
        const events = yield* EventRepo.Service;
        const before = yield* records.getById(RECORD_ID);

        for (const propOps of [
          `{ kind: "prop.set", propId: "temporary", value: { _tag: "bool", val: true } },
         { kind: "prop.set", propId: "${RECORD_ID}", value: { _tag: "bool", val: true } }`,
          `{ kind: "prop.set", propId: "task", value: { _tag: "bool", val: true } },
         { kind: "prop.set", propId: "priority", ruleId: "task", value: { _tag: "number", val: 1 } }`,
        ]) {
          const result = yield* runTestScript(`
          await api.editRecord("${RECORD_ID}", [
            { kind: "body.replace", text: "Alpha", with: "Not saved" },
            { kind: "date.set", date: "2024-02-29" },
            ${propOps},
          ]);
        `).pipe(Effect.result);

          expect(Result.isFailure(result)).toBe(true);
          expect(yield* records.getById(RECORD_ID)).toEqual(before);
          expect(yield* events.countPending()).toBe(0);
        }
      }),
    );
  });
});

describe("ExecuteApi.createRecord", () => {
  it("creates a supplied ID with ordered appends and the last date, then allows editing", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* runTestScript(dedent`
          const id = await api.createRecord("created-record", [
            { kind: "date.set", date: "invalid but superseded" },
            { kind: "body.append", markdown: "# Created" },
            { kind: "body.append", markdown: "See [Target](./target.md)." },
            { kind: "date.set", date: "2024-02-29" },
          ]);
          if (id !== "created-record") throw new Error("unexpected ID");
          await api.editRecord(id, [{ kind: "body.append", markdown: "Next." }]);
        `);
        const recordRepo = yield* RecordRepo.Service;
        const eventRepo = yield* EventRepo.Service;
        const record = yield* recordRepo.getById(RecordSchema.Id.make("created-record"));
        expect(record.title).toBe("Created");
        expect(record.date).toBe("2024-02-29");
        const markdown = "# Created\n\nSee [target](./target.md).\n\nNext.\n";
        expect(markdownFromContent(record.content)).toBe(markdown);
        const updates = yield* eventRepo.findUpdatesForRecord(record.id);
        expect(markdownAfterReplay(updates.map((event) => event.payload))).toBe(markdown);
        expect((yield* eventRepo.findPending(10)).map((event) => event.type)).toEqual([
          "update",
          "date",
          "update",
        ]);
      }),
    );
  });

  it("generates distinct IDs and persists empty and date-only records", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* runTestScript(dedent`
          const first = await api.createRecord(undefined, []);
          const second = await api.createRecord(undefined, [{ kind: "date.set", date: "2024-02-29" }]);
          if (!first || !second || first === second) throw new Error("invalid generated IDs");
          await api.editRecord(first, [{ kind: "body.append", markdown: "Generated." }]);
        `);
        const recordRepo = yield* RecordRepo.Service;
        const records = yield* recordRepo.findAllNotes();
        expect(records).toHaveLength(2);
        const dated = records.find((record) => record.date === "2024-02-29");
        expect(dated).toBeDefined();
        expect(RECORD_SCHEMA.nodeFromJSON(dated!.content).textContent).toBe("");
        const generated = records.find((record) => record.id !== dated!.id);
        expect(markdownFromContent(generated!.content)).toBe("Generated.\n");
        expect(generated!.date).toBe(toLocalDateString(generated!.createdAt));
      }),
    );
  });

  it("rejects empty IDs, replacement actions, and invalid final dates without saving", async () => {
    await runIntegration(
      Effect.gen(function* () {
        for (const call of [
          'api.createRecord("", [])',
          'api.createRecord("invalid", [{ kind: "body.replace", text: "", with: "no" }])',
          'api.createRecord("invalid", [{ kind: "body.append", markdown: "Not saved" }, { kind: "date.set", date: "2025-02-29" }])',
        ]) {
          const result = yield* runTestScript(`await ${call};`).pipe(Effect.result);

          expect(Result.isFailure(result)).toBe(true);
        }

        const recordRepo = yield* RecordRepo.Service;
        const eventRepo = yield* EventRepo.Service;
        expect(yield* recordRepo.findAllNotes()).toEqual([]);
        expect(yield* eventRepo.countPending()).toBe(0);
      }),
    );
  });

  it("rejects existing IDs, including records with only unmaterialized events", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* seedRecord(RECORD_ID, INITIAL_MARKDOWN);
        const recordRepo = yield* RecordRepo.Service;
        const eventRepo = yield* EventRepo.Service;
        const before = yield* recordRepo.getById(RECORD_ID);
        yield* eventRepo.create({
          recordId: RecordSchema.Id.make("unmaterialized"),
          type: "update",
          payload: fullUpdateFromMarkdown("Existing."),
          createdAt: yield* DateTime.now,
        });

        for (const id of [RECORD_ID, "unmaterialized"]) {
          const result = yield* runTestScript(dedent`
            await api.createRecord("${id}", [{ kind: "body.append", markdown: "Never saved." }]);
          `).pipe(Effect.result);

          expect(Result.isFailure(result)).toBe(true);

          if (Result.isFailure(result)) {
            expect(String(result.failure)).toContain(`Record already exists: ${id}`);
          }
        }

        expect(yield* recordRepo.getById(RECORD_ID)).toEqual(before);
        expect(yield* eventRepo.countPending()).toBe(1);
        expect(
          yield* eventRepo.findUpdatesForRecord(RecordSchema.Id.make("unmaterialized")),
        ).toHaveLength(1);
      }),
    );
  });

  it("allows only one concurrent creation for a supplied ID", async () => {
    await runIntegration(
      Effect.gen(function* () {
        yield* runTestScript(dedent`
          const results = await Promise.allSettled([
            api.createRecord("same-id", [{ kind: "body.append", markdown: "First." }]),
            api.createRecord("same-id", [{ kind: "body.append", markdown: "Second." }]),
          ]);
          if (results.filter((result) => result.status === "fulfilled").length !== 1) {
            throw new Error("Expected one successful creation");
          }
        `);
        const recordRepo = yield* RecordRepo.Service;
        const eventRepo = yield* EventRepo.Service;
        expect(yield* recordRepo.findAllNotes()).toHaveLength(1);
        expect(yield* eventRepo.countPending()).toBe(2);
      }),
    );
  });
});

describe("ExecuteApi.list", () => {
  it("uses nested text, link and property filters and resolves labels outside the result", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const project = RecordSchema.Id.make("project");
        const archived = RecordSchema.Id.make("archived");
        yield* seedRecord(project, "# Project");
        yield* seedRecord(
          RECORD_ID,
          "# Match\n\nNeedle%_ [Project](./project.md).\n\nLater paragraph.",
          2,
        );
        yield* seedRecord(archived, "Needle%_ [Project](./project.md).", 3);
        yield* seedRecord(RecordSchema.Id.make("other"), "NeedleXY [Project](./project.md).", 4);
        const db = yield* DB.Service;
        yield* db.execute(
          Query.insert(Tables.props).pipe(
            Query.from(
              DB.values(Tables.props, {
                recordId: archived,
                path: [],
                propId: RecordSchema.Id.make("builtin:archived"),
                value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
              }),
            ),
          ),
        );
        const events = yield* EventRepo.Service;
        const before = yield* events.countPending();
        const output: unknown[] = [];

        yield* runTestScript(`
        const records = await api.list({ filter: [
          { _tag: "and", val: [
            { _tag: "cmp", val: ["_tag", "=", "note"] },
            { _tag: "or", val: [
              { _tag: "cmp", val: ["body", "contains", "Needle%_"] },
              { _tag: "cmp", val: ["body", "contains", "absent"] },
            ] },
          ] },
          { _tag: "cmp", val: [["link", "->", "project"], "exists", true] },
          { _tag: "cmp", val: [["prop", "builtin:archived"], "=", { _tag: "bool", val: false }] },
        ] });
        text(records);
      `).pipe(
          Effect.provideService(Console.Console, {
            ...console,
            log: (...args) => {
              output.push(...args);
            },
          }),
        );

        expect(output).toHaveLength(1);
        const result = JSON.parse(String(output[0]));
        expect(result).toHaveLength(1);
        expect(result[0]).toMatchObject({
          id: RECORD_ID,
          title: "Match",
          markdown: "# Match\n\nNeedle%\\_ [Project](./project.md).\n\nLater paragraph.\n",
          snippets: ["Needle%\\_ [Project](./project.md)."],
          createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
          updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        });
        expect(result[0]).not.toHaveProperty("content");
        expect(yield* events.countPending()).toBe(before);

        yield* runTestScript(`
        const records = await api.list({ filter: [
          { _tag: "cmp", val: [["link", "<-", "${RECORD_ID}"], "exists", true] },
        ] });
        if (records.length !== 1 || records[0].id !== "project") throw new Error("incoming link filter");
      `);
      }),
    );
  });

  it("reads definitions, rule metadata and UI property states without writing events", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const attrs = yield* Attrs.Service.make;
        const status = RecordSchema.Id.make("status");
        const priority = RecordSchema.Id.make("priority");
        const related = RecordSchema.Id.make("related");
        const restricted = RecordSchema.Id.make("restricted");
        const done = RecordSchema.Id.make("done");
        const allowed = RecordSchema.Id.make("allowed");
        const task = RecordSchema.Id.make("task-rule");
        const old = RecordSchema.Id.make("old-rule");
        const missing = RecordSchema.Id.make("missing-rule");
        const formerProp = RecordSchema.Id.make("former-prop");
        const required = AttrsSchema.RuleExpectation.cases.required.make({});
        const optional = AttrsSchema.RuleExpectation.cases.optional.make({});
        const targets = [AttrsSchema.makeTargetFilterExpr.cmp({ val: ["id", "=", RECORD_ID] })];

        yield* seedPropsRecord(status, "# Status", (doc) => {
          return attrs.initializeProp({
            doc,
            defaultValue: AttrsSchema.PropVal.cases.enum.make({ val: done }),
          });
        });
        yield* seedPropsRecord(priority, "# Priority", (doc) => {
          return attrs.initializeProp({
            doc,
            defaultValue: AttrsSchema.PropVal.cases.number.make({ val: 2 }),
          });
        });
        yield* seedPropsRecord(done, "# Done", (doc) => {
          return attrs.initializeEnumOption({
            doc,
            enum_parent: status,
          });
        });
        yield* seedPropsRecord(allowed, "Allowed target", () => Effect.void);
        yield* seedPropsRecord(related, "# Related", (doc) => {
          return Effect.gen(function* () {
            yield* attrs.initializeProp({
              doc,
              defaultValue: AttrsSchema.PropVal.cases.link.make({ val: allowed }),
            });
            yield* attrs.setPropTargets({
              doc,
              targets: [AttrsSchema.makeTargetFilterExpr.cmp({ val: ["id", "=", allowed] })],
            });
          });
        });
        yield* seedPropsRecord(restricted, "# Restricted", (doc) => {
          return Effect.gen(function* () {
            yield* attrs.initializeProp({
              doc,
              defaultValue: AttrsSchema.PropVal.cases.link.make({ val: done }),
            });
            yield* attrs.setPropTargets({
              doc,
              targets: [AttrsSchema.makeTargetFilterExpr.cmp({ val: ["id", "=", done] })],
            });
          });
        });
        yield* seedPropsRecord(task, "# Task", (doc) => {
          return Effect.gen(function* () {
            yield* attrs.initializeRule({ doc, targets });
            yield* attrs.setRuleStorage({
              doc,
              storage: AttrsSchema.RuleStorage.cases.group.make({}),
            });
            yield* attrs.setRuleExpectation({ doc, propId: priority, value: required });
            yield* attrs.setRuleExpectation({ doc, propId: status, value: optional });
          });
        });
        yield* seedPropsRecord(old, "# Old rule", (doc) => {
          return attrs.initializeRule({
            doc,
            targets: [AttrsSchema.makeTargetFilterExpr.cmp({ val: ["id", "=", allowed] })],
          });
        });
        yield* seedPropsRecord(missing, "# Former rule", () => Effect.void);
        yield* seedPropsRecord(formerProp, "# Former property", () => Effect.void);
        yield* seedPropsRecord(RecordSchema.Id.make("empty-rule"), "# Empty group", (doc) => {
          return Effect.gen(function* () {
            yield* attrs.initializeRule({ doc, targets });
            yield* attrs.setRuleStorage({
              doc,
              storage: AttrsSchema.RuleStorage.cases.group.make({}),
            });
          });
        });
        yield* seedPropsRecord(RecordSchema.Id.make("top-rule"), "# Top rule", (doc) => {
          return Effect.gen(function* () {
            yield* attrs.initializeRule({ doc, targets });
            yield* attrs.setRuleExpectation({ doc, propId: status, value: required });
          });
        });
        yield* seedPropsRecord(RECORD_ID, "# Match", (doc) => {
          return Effect.gen(function* () {
            yield* attrs.setProp({
              doc,
              recordId: RECORD_ID,
              propId: related,
              value: AttrsSchema.PropVal.cases.link.make({ val: allowed }),
            });
            yield* attrs.setProp({
              doc,
              recordId: RECORD_ID,
              propId: restricted,
              value: AttrsSchema.PropVal.cases.link.make({ val: allowed }),
            });
            yield* attrs.setProp({
              doc,
              recordId: RECORD_ID,
              propId: formerProp,
              value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
            });
            yield* attrs.setGroupProp({
              doc,
              recordId: RECORD_ID,
              ruleId: task,
              propId: priority,
              value: AttrsSchema.PropVal.cases.text.make({ val: "wrong type" }),
            });
            yield* attrs.setGroupProp({
              doc,
              recordId: RECORD_ID,
              ruleId: old,
              propId: status,
              value: AttrsSchema.PropVal.cases.enum.make({ val: done }),
            });
            yield* attrs.setGroupProp({
              doc,
              recordId: RECORD_ID,
              ruleId: missing,
              propId: status,
              value: AttrsSchema.PropVal.cases.enum.make({ val: done }),
            });
          });
        });

        const events = yield* EventRepo.Service;
        const before = yield* events.countPending();
        const api = yield* ExecuteApi.makeApi();
        const defs = yield* Effect.promise(() => api.listProps());
        expect(defs.map((def) => def.id)).toContain("builtin:archived");
        expect(defs.find((def) => def.id === priority)).toMatchObject({
          prop_type: "number",
          prop_default: AttrsSchema.PropVal.cases.number.make({ val: 2 }),
        });

        const items = yield* Effect.promise(() => {
          return api.list({
            filter: [
              AttrsSchema.makeFilterExpr.or({
                val: [RECORD_ID, task, related, done].map((id) => {
                  return AttrsSchema.makeFilterExpr.cmp({ val: ["id", "=", id] });
                }),
              }),
            ],
          });
        });

        const note = items.find((item) => item.id === RECORD_ID);
        expect(note?._tag).toBe("note");
        expect(note?.props.top).toContainEqual(
          expect.objectContaining({
            propId: status,
            expectation: required,
            value: { state: Attrs.ValueState.Unset(), label: null },
          }),
        );
        expect(note?.props.top).toContainEqual(
          expect.objectContaining({
            propId: related,
            value: {
              state: Attrs.ValueState.Valid({
                value: AttrsSchema.PropVal.cases.link.make({ val: allowed }),
              }),
              label: "Allowed target",
            },
          }),
        );
        expect(note?.props.top).toContainEqual(
          expect.objectContaining({
            propId: restricted,
            value: {
              state: Attrs.ValueState.Invalid({
                value: AttrsSchema.PropVal.cases.link.make({ val: allowed }),
              }),
              label: "Allowed target",
            },
          }),
        );
        expect(note?.props.top).toContainEqual({
          propId: formerProp,
          label: "Former property",
          def: null,
          expectation: null,
          value: {
            state: Attrs.ValueState.Invalid({
              value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
            }),
            label: "True",
          },
        });
        expect(note?.props.groups).toEqual([
          expect.objectContaining({ ruleId: missing, label: "Former rule", status: "Unavailable" }),
          expect.objectContaining({ ruleId: old, label: "Old rule", status: "Unmatched" }),
          expect.objectContaining({
            ruleId: task,
            status: "Matching",
            props: [
              expect.objectContaining({
                propId: priority,
                expectation: required,
                value: {
                  state: Attrs.ValueState.Invalid({
                    value: AttrsSchema.PropVal.cases.text.make({ val: "wrong type" }),
                  }),
                  label: "wrong type",
                },
              }),
              expect.objectContaining({
                propId: status,
                expectation: optional,
                value: { state: Attrs.ValueState.Unset(), label: null },
              }),
            ],
          }),
        ]);
        expect(
          note?.props.groups.find((group) => group.ruleId === old)?.props[0]?.value.label,
        ).toBe("Done");
        expect(items.find((item) => item.id === task)?._tag).toBe("rule");
        expect(items.find((item) => item.id === task)).toMatchObject({
          rule_storage: AttrsSchema.RuleStorage.cases.group.make({}),
          rule_targets: targets,
          rule_expects: { [priority]: required, [status]: optional },
        });
        expect(items.find((item) => item.id === related)?._tag).toBe("prop");
        expect(items.find((item) => item.id === related)).toMatchObject({
          prop_type: "link",
          prop_default: {
            state: Attrs.ValueState.Valid({
              value: AttrsSchema.PropVal.cases.link.make({ val: allowed }),
            }),
            label: "Allowed target",
          },
        });
        expect(items.find((item) => item.id === done)?._tag).toBe("owned");
        expect(items.find((item) => item.id === done)).toMatchObject({
          owned_type: "enum_option",
          owned_parent: status,
        });
        expect(yield* events.countPending()).toBe(before);
      }),
    );
  });

  it("sorts before limiting and uses stable date, creation and ID tie-breakers", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const records = yield* RecordRepo.Service;
        const ids = ["b", "a", "c", "d"].map((id) => RecordSchema.Id.make(id));

        for (const [index, id] of ids.entries()) {
          yield* seedRecord(id, `# ${id}`, index + 1);
          yield* records.updateById(id, {
            date: "2026-11-08",
            createdAt: DateTime.makeUnsafe("2026-11-08T10:00:00.000Z"),
            updatedAt: DateTime.makeUnsafe("2026-11-09T10:00:00.000Z"),
          });
        }

        yield* records.updateById(RecordSchema.Id.make("c"), {
          createdAt: DateTime.makeUnsafe("2026-11-08T11:00:00.000Z"),
        });
        yield* records.updateById(RecordSchema.Id.make("d"), {
          date: "2026-11-07",
          updatedAt: DateTime.makeUnsafe("2026-11-10T10:00:00.000Z"),
        });

        yield* runTestScript(`
        const byDate = await api.list();
        if (byDate.map(record => record.id).join() !== "c,a,b,d") throw new Error("date ordering");
        const limited = await api.list({ limit: 2 });
        if (limited.map(record => record.id).join() !== "c,a") throw new Error("limit after sort");
        const byUpdate = await api.list({ sort: "updated" });
        if (byUpdate.map(record => record.id).join() !== "d,a,b,c") throw new Error("updated ordering");
      `);
      }),
    );
  });

  it("catches up interrupted events and sees creates and edits within the same script", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const events = yield* EventRepo.Service;
        yield* events.create({
          recordId: RECORD_ID,
          type: "update",
          payload: fullUpdateFromMarkdown("# Interrupted\n\nPending body."),
          createdAt: yield* DateTime.now,
        });

        yield* runTestScript(`
        const pending = await api.list();
        if (pending.length !== 1 || pending[0].title !== "Interrupted") throw new Error("catch-up");
        await api.createRecord("created", [{ kind: "body.append", markdown: "# Created" }]);
        if ((await api.list()).length !== 2) throw new Error("create visibility");
        await api.editRecord("created", [{ kind: "body.replace", text: "Created", with: "Edited" }]);
        const edited = await api.list({ filter: [{ _tag: "cmp", val: ["id", "=", "created"] }] });
        if (edited[0].title !== "Edited") throw new Error("edit visibility");
      `);
        expect(yield* events.countPending()).toBe(4);
      }),
    );
  });

  it("keeps all record kinds by default and preserves Markdown blocks in snippets", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const fixtures = [
          ["empty", ""],
          ["heading", "# Heading"],
          ["code", "# Code\n\n```js\nconst x = 1;\n```\n\nLater."],
          ["list", "# List\n\n- [ ] First\n- Second"],
        ] as const;

        for (const [index, fixture] of fixtures.entries()) {
          const [id, markdown] = fixture;
          yield* seedRecord(RecordSchema.Id.make(id), markdown, index + 1);
        }

        const records = yield* RecordRepo.Service;
        yield* records.updateAttrs({
          id: RecordSchema.Id.make("heading"),
          columns: {
            _tag: AttrsSchema.RecordTag.make("prop"),
            prop_type: null,
            prop_default: null,
            prop_targets: null,
            owned_type: null,
            owned_parent: null,
            rule_storage: null,
            rule_targets: null,
            attrs_valid: false,
          },
        });
        const all = yield* CliList.list();
        expect(all).toHaveLength(4);
        expect(all.find(({ id }) => id === "empty")?.snippets).toEqual([]);
        expect(all.find(({ id }) => id === "heading")?.snippets).toEqual([]);
        expect(all.find(({ id }) => id === "code")?.snippets).toEqual(["```js\nconst x = 1;\n```"]);
        expect(all.find(({ id }) => id === "list")?.snippets).toEqual(["- [ ] First"]);

        const filtered = yield* CliList.list({
          filter: [AttrsSchema.makeFilterExpr.cmp({ val: ["_tag", "=", "prop"] })],
        });

        expect(filtered.map(({ id }) => id)).toEqual(["heading"]);
      }),
    );
  });
});

describe("CliExecute.runScript", () => {
  it("rejects module exports instead of executing them on the host", async () => {
    await expect(runIntegration(runTestScript("export const edit = true;\n"))).rejects.toThrow(
      /unsupported keyword: export/i,
    );
  });
});

function runTestScript(source: string) {
  return Effect.scoped(
    Effect.gen(function* () {
      const workspace = yield* Effect.acquireRelease(
        Effect.promise(() => mkdtemp(path.join(tmpdir(), "manotes-test-script-"))),
        (workspace) => Effect.promise(() => rm(workspace, { recursive: true, force: true })),
      );

      const scriptPath = path.join(workspace, "edit.js");
      yield* Effect.promise(() => writeFile(scriptPath, source));
      yield* CliExecute.runScript(scriptPath);
    }),
  );
}

function seedRecord(recordId: RecordSchema.Id, markdown: string, commitSeq = 1) {
  const update = fullUpdateFromMarkdown(markdown);

  return Effect.gen(function* () {
    const eventRepo = yield* EventRepo.Service;
    const materializer = yield* Materializer.Service;

    const event = yield* eventRepo.create({
      recordId,
      type: "update",
      payload: update,
      createdAt: yield* DateTime.now,
      commitSeq,
    });

    yield* materializer.materializeRecordUpTo({ recordId, upToLocalSeq: event.localSeq });

    return { localSeq: event.localSeq, update };
  });
}

const seedPropsRecord = Effect.fn("ExecuteApiTest.seedPropsRecord")(function* (
  recordId: RecordSchema.Id,
  markdown: string,
  configure: (doc: Y.Doc) => Effect.Effect<void, unknown>,
) {
  const doc = yield* Effect.acquireRelease(
    Effect.sync(() => new Y.Doc()),
    (doc) => Effect.sync(() => doc.destroy()),
  );

  Y.applyUpdate(doc, fullUpdateFromMarkdown(markdown));
  yield* configure(doc);
  const events = yield* EventRepo.Service;
  const materializer = yield* Materializer.Service;

  const event = yield* events.create({
    recordId,
    type: "update",
    payload: Y.encodeStateAsUpdate(doc),
    createdAt: yield* DateTime.now,
  });

  yield* materializer.materializeRecordUpTo({ recordId, upToLocalSeq: event.localSeq });
}, Effect.scoped);

function fullUpdateFromMarkdown(markdown: string): Uint8Array<ArrayBufferLike> {
  const yDoc = prosemirrorJSONToYDoc(
    RECORD_SCHEMA,
    MdParse.parse(markdown).toJSON(),
    PROSEMIRROR_XML_FRAGMENT_KEY,
  );

  try {
    return Y.encodeStateAsUpdate(yDoc);
  } finally {
    yDoc.destroy();
  }
}

function deltaFromMarkdown(
  baseUpdate: Uint8Array<ArrayBufferLike>,
  markdown: string,
): Uint8Array<ArrayBufferLike> {
  const yDoc = new Y.Doc();

  try {
    Y.applyUpdate(yDoc, baseUpdate);
    const fragment = getProsemirrorXmlFragment(yDoc);
    const { meta } = initProseMirrorDoc(fragment, RECORD_SCHEMA);
    const stateVector = Y.encodeStateVector(yDoc);
    updateYFragment(yDoc, fragment, MdParse.parse(markdown), meta);

    return Y.encodeStateAsUpdate(yDoc, stateVector);
  } finally {
    yDoc.destroy();
  }
}

function markdownAfterReplay(updates: ReadonlyArray<Uint8Array<ArrayBufferLike>>): string {
  const yDoc = replay(updates);

  try {
    return MdSerialize.serialize(
      initProseMirrorDoc(getProsemirrorXmlFragment(yDoc), RECORD_SCHEMA).doc,
    );
  } finally {
    yDoc.destroy();
  }
}

function stateVectorAfterReplay(
  updates: ReadonlyArray<Uint8Array<ArrayBufferLike>>,
): ReadonlyArray<number> {
  const yDoc = replay(updates);

  try {
    return Array.from(Y.encodeStateVector(yDoc));
  } finally {
    yDoc.destroy();
  }
}

function replay(updates: ReadonlyArray<Uint8Array<ArrayBufferLike>>): Y.Doc {
  const yDoc = new Y.Doc();

  for (const update of updates) Y.applyUpdate(yDoc, update);

  return yDoc;
}

function markdownFromContent(content: UnknownNodeJSON): string {
  return MdSerialize.serialize(RECORD_SCHEMA.nodeFromJSON(content));
}

function requireSnapshot(update: Uint8Array<ArrayBufferLike> | null): Uint8Array<ArrayBufferLike> {
  if (update === null) throw new Error("Expected a materialized Yjs snapshot");

  return update;
}

async function runIntegration(
  program: Effect.Effect<void, unknown, RuntimeServices>,
): Promise<void> {
  await withTempWorkspace(async (workspace) => {
    const configLayer = Layer.succeed(
      DB.Config,
      DB.Config.of({
        localGraphId: "test-graph",
        databasePath: path.join(workspace, "db.sqlite"),
      }),
    );

    await Effect.runPromise(
      program.pipe(
        Effect.provide(CliRuntime.layer),
        Effect.provide(configLayer),
        Effect.provide(NodeServices.layer),
        Effect.provide(Reactivity.layer),
        Effect.scoped,
      ),
    );
  });
}

async function withTempWorkspace<A>(use: (workspace: string) => Promise<A>): Promise<A> {
  const workspace = await mkdtemp(path.join(tmpdir(), "manotes-execute-api-"));

  try {
    return await use(workspace);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
}
