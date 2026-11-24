/**
 * Generates a Manotes backup file (`.manotes-events.json`) for a prepared demo
 * graph. Import the output via the app's import route to get a fresh demo graph.
 *
 * Usage: tsx scripts/generate-demo-graph.ts <output-path>
 */
import { RecordSchema } from "@manotes/shared/record.schema";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { writeFileSync } from "node:fs";
import { DateTime, Effect, Predicate, Record } from "effect";
import { nanoid } from "nanoid";
import { prosemirrorJSONToYDoc } from "y-prosemirror";
import * as Y from "yjs";
import { EventSchema } from "@manotes/shared/event.schema";
import { GraphBackupSchema } from "@manotes/shared/graph-backup/schema";
import { RECORD_SCHEMA } from "@manotes/shared/prosemirror/app-schema";
import { PROSEMIRROR_XML_FRAGMENT_KEY } from "@manotes/shared/prosemirror/yjs";
import { toLocalDateString } from "@manotes/shared/temporal/utils";
import { ENTRIES, PAGES, SOURCE_GRAPH_DISPLAY_NAME } from "./demo-content";
import type { Block, Inline } from "./demo-content";

const pageIds = Record.map(PAGES, () => RecordSchema.Id.make(nanoid()));

const presets = [
  {
    title: "Notes",
    filter: [
      ...StreamSettings.defaultFilter,
      AttrsSchema.makeFilterExpr.cmp({ val: ["title", "exists", false] }),
    ],
    default: true,
  },
  {
    title: "Pages",
    filter: [
      ...StreamSettings.defaultFilter,
      AttrsSchema.makeFilterExpr.cmp({ val: ["title", "exists", true] }),
    ],
    default: false,
  },
];

function inlineToJSON(inline: Inline) {
  if (Predicate.isString(inline)) return { type: "text", text: inline };

  return { type: "backlink", attrs: { id: pageIds[inline.backlink] } };
}

function blockToJSON(block: Block) {
  if ("h1" in block) {
    return { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: block.h1 }] };
  }

  return { type: "paragraph", content: block.p.map(inlineToJSON) };
}

function buildPayload(
  blocks: Array<Block>,
  preset?: { filter: AttrsSchema.Filter; default: boolean },
): Uint8Array<ArrayBufferLike> {
  const yDoc = prosemirrorJSONToYDoc(
    RECORD_SCHEMA,
    { type: "doc", content: blocks.map(blockToJSON) },
    PROSEMIRROR_XML_FRAGMENT_KEY,
  );

  try {
    if (preset) {
      Effect.runSync(
        Effect.gen(function* () {
          const attrs = yield* Attrs.Service;
          yield* attrs.initializePreset({ doc: yDoc, filter: preset.filter });
          yield* attrs.setPresetDefault({ doc: yDoc, value: preset.default });
        }).pipe(Effect.provide(Attrs.Service.layer)),
      );
    }

    return Y.encodeStateAsUpdate(yDoc);
  } finally {
    yDoc.destroy();
  }
}

function event(
  recordId: RecordSchema.Id,
  type: "update" | "date",
  payload: Uint8Array<ArrayBufferLike>,
  createdAt: DateTime.Utc,
): GraphBackupSchema.Record {
  return { recordId, type, payload, createdAt, id: nanoid() };
}

const now = DateTime.nowUnsafe();

const events: Array<GraphBackupSchema.Record> = [];

// Pages are created first (oldest), staggered by a second so order is stable.
for (const [index, [key, page]] of Record.toEntries(PAGES).entries()) {
  const createdAt = DateTime.add(DateTime.subtract(now, { days: 90 }), { seconds: index });
  events.push(event(pageIds[key], "update", buildPayload(page.blocks), createdAt));
}

for (const [index, preset] of presets.entries()) {
  const createdAt = DateTime.add(DateTime.subtract(now, { days: 90 }), {
    seconds: Object.keys(PAGES).length + index,
  });

  events.push(
    event(
      RecordSchema.Id.make(nanoid()),
      "update",
      buildPayload([{ h1: preset.title }], preset),
      createdAt,
    ),
  );
}

// Journal entries: an `update` event plus a `date` event pinning the day.
for (const entry of ENTRIES) {
  const recordId = RecordSchema.Id.make(nanoid());
  const createdAt = DateTime.subtract(now, { days: entry.daysAgo });
  const date = toLocalDateString(createdAt);
  const datePayload = Effect.runSync(EventSchema.encodeDatePayload({ date }));

  events.push(event(recordId, "update", buildPayload(entry.blocks), createdAt));
  events.push(event(recordId, "date", datePayload, DateTime.add(createdAt, { seconds: 1 })));
}

events.sort((a, b) => DateTime.toEpochMillis(a.createdAt) - DateTime.toEpochMillis(b.createdAt));

export const bundle: GraphBackupSchema.Bundle = {
  version: 2,
  exportedAt: now,
  sourceGraphDisplayName: SOURCE_GRAPH_DISPLAY_NAME,
  events,
};

if (import.meta.main) {
  const outputPath = process.argv[2];

  if (process.argv.length !== 3 || !outputPath) {
    console.error("Usage: tsx scripts/generate-demo-graph.ts <output-path>");
    process.exit(1);
  }

  writeFileSync(outputPath, Effect.runSync(GraphBackupSchema.encodeFile(bundle)));
  console.log(
    `Wrote ${events.length} events (${Object.keys(PAGES).length} pages, ${ENTRIES.length} entries, ${presets.length} presets) to ${outputPath}`,
  );
}
