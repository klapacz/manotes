/* eslint-disable anti-slop-effect/no-manual-tagged-construction -- Sand wire fixtures deliberately use legacy literal tags. */
import { DateTime, Effect, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { EventSchema } from "@manotes/shared/event.schema";
import { GraphBackupSchema } from "@manotes/shared/graph-backup/schema";
import { StreamRefSpec } from "@manotes/shared/editor/stream-ref/spec";
import { Filters } from "@manotes/shared/record/filters";
import { RECORD_SCHEMA } from "@manotes/shared/prosemirror/app-schema";
import { GraphBackupFile } from "./file";

const exportedAt = Schema.decodeUnknownSync(Schema.DateTimeUtcFromString)(
  "2026-10-01T12:00:00.000Z",
);

const cmp = AttrsSchema.makeFilterExpr.cmp;

const project = AttrsSchema.RecordId.make("project");

type LegacyFilter = {
  readonly type?: string | { readonly _tag: string; readonly enum_parent?: string };
  readonly props?: Readonly<Record<string, AttrsSchema.PropVal>>;
  readonly search?: string;
  readonly date?: string;
  readonly backlinksTo?: string;
  readonly linksFrom?: string;
};

describe("temporary sand backup import", () => {
  it.each([
    [
      {},
      [
        cmp({ val: ["_tag", "=", "note"] }),
        cmp({ val: ["title", "exists", false] }),
        Filters.aliases.unarchived.make(),
      ],
    ],
    [
      { type: { _tag: "notes" }, props: {} },
      [cmp({ val: ["_tag", "=", "note"] }), cmp({ val: ["title", "exists", false] })],
    ],
    [
      { type: { _tag: "pages" }, props: {} },
      [cmp({ val: ["_tag", "=", "note"] }), cmp({ val: ["title", "exists", true] })],
    ],
    [{ type: { _tag: "prop" }, props: {} }, [cmp({ val: ["_tag", "=", "prop"] })]],
    [{ type: { _tag: "rule" }, props: {} }, [cmp({ val: ["_tag", "=", "rule"] })]],
    [
      { type: { _tag: "enum_option", enum_parent: project }, props: {} },
      [Filters.enumOptions.make(project)],
    ],
    [
      { type: "notes" },
      [
        cmp({ val: ["_tag", "=", "note"] }),
        cmp({ val: ["title", "exists", false] }),
        Filters.aliases.unarchived.make(),
      ],
    ],
    [
      { type: "pages" },
      [
        cmp({ val: ["_tag", "=", "note"] }),
        cmp({ val: ["title", "exists", true] }),
        Filters.aliases.unarchived.make(),
      ],
    ],
    [{ type: "prop" }, [cmp({ val: ["_tag", "=", "prop"] }), Filters.aliases.unarchived.make()]],
  ] satisfies readonly (readonly [LegacyFilter, AttrsSchema.Filter])[])(
    "converts legacy type and archive defaults %#",
    async (filter, expected) => {
      const source = new Y.Doc();
      const replay = new Y.Doc();

      try {
        appendReference(source, filter);
        const backup = await read([update(source, "first")]);
        Y.applyUpdate(replay, backup.events[0]!.payload);

        expect(settings(replay)).toEqual({ filter: expected, sort: "updated", view: "snippets" });
        expect(backup.version).toBe(2);
      } finally {
        source.destroy();
        replay.destroy();
      }
    },
  );

  it("preserves search, dates, link directions and explicit property values", async () => {
    const source = new Y.Doc();
    const replay = new Y.Doc();

    try {
      appendReference(source, {
        type: { _tag: "pages" },
        search: "  hello  ",
        date: "2026-10-01",
        backlinksTo: project,
        linksFrom: "source",
        props: {
          status: { _tag: "enum", val: project },
          "builtin:archived": { _tag: "bool", val: true },
        },
      });
      const backup = await read([update(source, "first")]);
      Y.applyUpdate(replay, backup.events[0]!.payload);

      expect(settings(replay).filter).toEqual([
        cmp({ val: ["_tag", "=", "note"] }),
        cmp({ val: ["title", "exists", true] }),
        cmp({ val: ["body", "contains", "hello"] }),
        cmp({ val: ["date", "=", "2026-10-01"] }),
        cmp({ val: [["link", "->", project], "exists", true] }),
        cmp({ val: [["link", "<-", AttrsSchema.RecordId.make("source")], "exists", true] }),
        cmp({
          val: [["prop", AttrsSchema.RecordId.make("status")], "=", { _tag: "enum", val: project }],
        }),
        cmp({
          val: [
            ["prop", AttrsSchema.RecordId.make("builtin:archived")],
            "=",
            { _tag: "bool", val: true },
          ],
        }),
      ]);
    } finally {
      source.destroy();
      replay.destroy();
    }
  });

  it("compacts edit history, keeps record metadata and re-exports without the converter", async () => {
    const source = new Y.Doc();
    const other = new Y.Doc();
    const replay = new Y.Doc();
    const otherReplay = new Y.Doc();
    const fresh = new Y.Doc();

    try {
      const reference = appendReference(source, {});
      const props = new Y.Map();
      source.getMap("attrs").set("props", props);
      props.set("status", { _tag: "enum", val: project });
      const events = [update(source, "first")];

      appendReference(other, { type: { _tag: "rule" } });
      events.push({ ...update(other, "other"), recordId: AttrsSchema.RecordId.make("other") });

      for (let index = 0; index < 105; index++) {
        const before = Y.encodeStateVector(source);
        reference.setAttribute("filter", { type: { _tag: "pages" }, search: `edit ${index}` });
        events.push({
          ...update(source, `edit-${index}`, before),
          createdAt: DateTime.add(exportedAt, { seconds: index + 1 }),
        });
      }

      const dateEvent: GraphBackupSchema.Record = {
        ...events[0]!,
        id: "date",
        type: "date",
        payload: Effect.runSync(EventSchema.encodeDatePayload({ date: "2026-09-30" })),
      };

      events.splice(50, 0, dateEvent);

      const backup = await read(events);
      expect(backup.events.map(({ payload: _payload, ...event }) => event)).toEqual(
        [events[0]!, events[1]!, dateEvent, events.at(-1)!].map(
          ({ payload: _payload, ...event }) => event,
        ),
      );
      expect(backup.events[2]).toEqual(dateEvent);

      for (const event of backup.events) {
        if (event.type === "date") continue;

        if (event.recordId === AttrsSchema.RecordId.make("other")) {
          Y.applyUpdate(otherReplay, event.payload);
          continue;
        }

        Y.applyUpdate(replay, event.payload);
      }

      expect(settings(replay).filter).toEqual([
        cmp({ val: ["_tag", "=", "note"] }),
        cmp({ val: ["title", "exists", true] }),
        cmp({ val: ["body", "contains", "edit 104"] }),
        Filters.aliases.unarchived.make(),
      ]);
      expect(settings(otherReplay).filter).toEqual([
        cmp({ val: ["_tag", "=", "rule"] }),
        Filters.aliases.unarchived.make(),
      ]);
      expect(replay.getMap("attrs").toJSON()).toEqual(source.getMap("attrs").toJSON());

      const encoded = await Effect.runPromise(GraphBackupSchema.encodeFile(backup));
      const decoded = await Effect.runPromise(GraphBackupSchema.decodeFile(encoded));

      for (const event of decoded.events) {
        if (event.type === "update" && event.recordId === project) {
          Y.applyUpdate(fresh, event.payload);
        }
      }

      expect(settings(fresh)).toEqual(settings(replay));

      const content = yXmlFragmentToProseMirrorRootNode(
        fresh.getXmlFragment("prosemirror"),
        RECORD_SCHEMA,
      );

      content.check();
      expect(content.textContent).toContain("Preserved note");

      const before = Y.encodeStateVector(fresh);
      appendReference(fresh, []);
      Y.applyUpdate(replay, Y.encodeStateAsUpdate(fresh, before));
      expect(replay.getXmlFragment("prosemirror").length).toBe(2);
    } finally {
      source.destroy();
      other.destroy();
      replay.destroy();
      otherReplay.destroy();
      fresh.destroy();
    }
  });

  it("leaves v2 payloads and already canonical v1 filters unchanged", async () => {
    const source = new Y.Doc();
    const replay = new Y.Doc();

    try {
      appendReference(source, []);
      const events = [update(source, "first")];
      expect((await read(events, 2)).events).toEqual(events);
      const converted = await read(events);
      Y.applyUpdate(replay, converted.events[0]!.payload);
      expect(settings(replay).filter).toEqual([]);
    } finally {
      source.destroy();
      replay.destroy();
    }
  });

  it("imports live sand noteId events with string streamRef types and rejects noteId in v2", async () => {
    const source = new Y.Doc();
    const replay = new Y.Doc();

    try {
      appendReference(source, { type: "pages", search: "hello", backlinksTo: "", linksFrom: "" });

      const encoded = Effect.runSync(
        GraphBackupSchema.encodeBundle({
          version: 2,
          exportedAt,
          sourceGraphDisplayName: "Friend's graph",
          events: [update(source, "first")],
        }),
      );

      const noteIdEvents = encoded.events.map(({ recordId, ...rest }) => ({
        ...rest,
        noteId: recordId,
      }));

      const v1File = new File(
        [JSON.stringify({ ...encoded, version: 1, events: noteIdEvents })],
        "sand.manotes-events.json",
      );

      const backup = await Effect.runPromise(GraphBackupFile.readBackupFile(v1File));
      expect(backup.version).toBe(2);
      expect(backup.events[0]?.recordId).toBe(project);
      Y.applyUpdate(replay, backup.events[0]!.payload);
      expect(settings(replay).filter).toEqual([
        cmp({ val: ["_tag", "=", "note"] }),
        cmp({ val: ["title", "exists", true] }),
        cmp({ val: ["body", "contains", "hello"] }),
        Filters.aliases.unarchived.make(),
      ]);

      const v2File = new File(
        [JSON.stringify({ ...encoded, version: 2, events: noteIdEvents })],
        "v2-invalid.manotes-events.json",
      );

      await expect(Effect.runPromise(GraphBackupFile.readBackupFile(v2File))).rejects.toThrow();
    } finally {
      source.destroy();
      replay.destroy();
    }
  });

  it("rejects malformed filters, corrupt Yjs updates and unknown versions", async () => {
    const source = new Y.Doc();

    try {
      appendReference(source, { type: { _tag: "unknown" } });
      const event = update(source, "first");
      await expect(read([event])).rejects.toThrow();
      await expect(read([{ ...event, payload: new Uint8Array([255]) }])).rejects.toThrow();
      await expect(read([], 3)).rejects.toThrow();
    } finally {
      source.destroy();
    }
  });
});

function appendReference(doc: Y.Doc, filter: LegacyFilter | AttrsSchema.Filter) {
  const reference = new Y.XmlElement("streamRef");

  const paragraph = new Y.XmlElement("paragraph");
  doc.getXmlFragment("prosemirror").push([paragraph]);
  paragraph.push([reference]);
  const text = new Y.XmlText();
  paragraph.push([text]);
  text.insert(0, "Preserved note");
  // SAFETY: y-prosemirror stores JSON filter attributes despite Yjs defaulting them to strings.
  const attributes = reference as Y.XmlElement<{ filter: LegacyFilter | AttrsSchema.Filter }>;
  attributes.setAttribute("filter", filter);
  reference.setAttribute("sort", "updated");
  reference.setAttribute("view", "snippets");

  return attributes;
}

function update(doc: Y.Doc, id: string, before?: Uint8Array): GraphBackupSchema.Record {
  return {
    recordId: project,
    type: "update",
    id,
    createdAt: exportedAt,
    payload: Y.encodeStateAsUpdate(doc, before),
  };
}

function settings(doc: Y.Doc) {
  const paragraph = doc.getXmlFragment("prosemirror").get(0);

  if (!(paragraph instanceof Y.XmlElement)) throw new Error("Missing paragraph");

  const reference = paragraph.get(0);

  if (!(reference instanceof Y.XmlElement)) throw new Error("Missing stream reference");

  return StreamRefSpec.decodeAttrs(reference.getAttributes());
}

function read(events: GraphBackupSchema.Bundle["events"], version = 1) {
  const encoded = Effect.runSync(
    GraphBackupSchema.encodeBundle({
      version: 2,
      exportedAt,
      sourceGraphDisplayName: "Friend's graph",
      events,
    }),
  );

  const file = new File([JSON.stringify({ ...encoded, version })], "sand.manotes-events.json");

  return Effect.runPromise(GraphBackupFile.readBackupFile(file));
}
