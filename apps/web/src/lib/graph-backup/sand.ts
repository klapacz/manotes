import { Effect, Match, Record, Schema } from "effect";
import * as Y from "yjs";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { GraphBackupSchema } from "@manotes/shared/graph-backup/schema";
import { Filters } from "@manotes/shared/record/filters";
import { TemporalSchema } from "@manotes/shared/temporal.schema";

// Temporary sand v1 import. After migration, delete this module and its tests,
// and restore GraphBackupSchema.decodeFile in file.ts.
export const decodeFile = Effect.fn("GraphBackupSand.decodeFile")(function* (text: string) {
  const backup = yield* Schema.decodeUnknownEffect(InputFile)(text);

  if (backup.version === 2) return { ...backup, version: 2 as const };

  const events = yield* Effect.try(() => convertEvents(backup.events));

  return { ...backup, version: 2 as const, events } satisfies GraphBackupSchema.Bundle;
});

const InputFile = Schema.fromJsonString(
  Schema.Struct({ ...GraphBackupSchema.Bundle.fields, version: Schema.Literals([1, 2]) }),
);

// Source: sand 9e4613359ed6, packages/shared/src/record/pane.schema.ts and
// stream-filter.ts. Keep its filter contract and defaults only for this import.
const SandFilter = Schema.Struct({
  type: Schema.TaggedUnion({
    notes: {},
    pages: {},
    prop: {},
    rule: {},
    enum_option: { enum_parent: AttrsSchema.RecordId },
  }).pipe(Schema.withDecodingDefault(Effect.succeed({ _tag: "notes" as const }))),
  backlinksTo: Schema.optional(AttrsSchema.RecordId),
  linksFrom: Schema.optional(AttrsSchema.RecordId),
  date: Schema.optional(TemporalSchema.PlainDateString),
  search: Schema.optional(Schema.String),
  props: Schema.optional(Schema.Record(AttrsSchema.RecordId, AttrsSchema.PropVal)),
});

function convertEvents(events: GraphBackupSchema.Bundle["events"]) {
  const docs = new Map<
    AttrsSchema.RecordId,
    {
      readonly doc: Y.Doc;
      readonly first: GraphBackupSchema.Record;
      last: GraphBackupSchema.Record;
    }
  >();

  try {
    for (const event of events) {
      if (event.type !== "update") continue;

      let record = docs.get(event.recordId);

      if (record === undefined) {
        record = { doc: new Y.Doc(), first: event, last: event };
        docs.set(event.recordId, record);
      }

      Y.applyUpdate(record.doc, event.payload);
      record.last = event;
    }

    const replacements = new Map<GraphBackupSchema.Record, GraphBackupSchema.Record>();

    for (const { doc, first, last } of docs.values()) {
      convertReferences(doc);

      // Keep creation/update times, replacing sand edit history with one final snapshot.
      replacements.set(first, { ...first, payload: new Uint8Array([0, 0]) });
      replacements.set(last, { ...last, payload: Y.encodeStateAsUpdate(doc) });
    }

    return events.flatMap((event) => {
      if (event.type !== "update") return [event];

      const replacement = replacements.get(event);

      return replacement === undefined ? [] : [replacement];
    });
  } finally {
    for (const { doc } of docs.values()) doc.destroy();
  }
}

function convertReferences(doc: Y.Doc) {
  for (const node of doc.getXmlFragment("prosemirror").createTreeWalker(() => true)) {
    if (!(node instanceof Y.XmlElement) || node.nodeName !== "streamRef") continue;

    const raw = node.getAttribute("filter");

    if (Schema.is(AttrsSchema.Filter)(raw)) continue;

    const filter = convertFilter(Schema.decodeUnknownSync(SandFilter)(raw));
    // SAFETY: Yjs traversal types assume strings; this streamRef filter is validated JSON.
    const reference = node as Y.XmlElement<{ filter: AttrsSchema.Filter }>;
    reference.setAttribute("filter", filter);
  }
}

function convertFilter(filter: typeof SandFilter.Type): AttrsSchema.Filter {
  const cmp = AttrsSchema.makeFilterExpr.cmp;

  const type: AttrsSchema.FilterExpr[] = Match.value(filter.type).pipe(
    Match.tag("notes", () => {
      return [cmp({ val: ["_tag", "=", "note"] }), cmp({ val: ["title", "exists", false] })];
    }),
    Match.tag("pages", () => {
      return [cmp({ val: ["_tag", "=", "note"] }), cmp({ val: ["title", "exists", true] })];
    }),
    Match.tag("prop", () => [cmp({ val: ["_tag", "=", "prop"] })]),
    Match.tag("rule", () => [cmp({ val: ["_tag", "=", "rule"] })]),
    Match.tag("enum_option", ({ enum_parent }) => [Filters.enumOptions.make(enum_parent)]),
    Match.exhaustive,
  );

  const expressions: AttrsSchema.FilterExpr[] = [...type];
  const search = filter.search?.trim();

  if (search) expressions.push(cmp({ val: ["body", "contains", search] }));

  if (filter.date !== undefined) expressions.push(cmp({ val: ["date", "=", filter.date] }));

  if (filter.backlinksTo !== undefined) {
    expressions.push(cmp({ val: [["link", "->", filter.backlinksTo], "exists", true] }));
  }

  if (filter.linksFrom !== undefined) {
    expressions.push(cmp({ val: [["link", "<-", filter.linksFrom], "exists", true] }));
  }

  if (filter.props === undefined) {
    expressions.push(Filters.aliases.unarchived.make());
  } else {
    for (const [id, value] of Record.toEntries(filter.props)) {
      expressions.push(cmp({ val: [["prop", id], "=", value] }));
    }
  }

  return expressions;
}

export * as GraphBackupSand from "./sand";
