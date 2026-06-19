/**
 * Generates a Manotes backup file (`.manotes-events.json`) for a prepared demo
 * graph. Import the output via the app's import route to get a fresh demo graph.
 *
 * Usage: tsx scripts/generate-demo-graph.ts <output-path>
 */
import { writeFileSync } from "node:fs";
import { DateTime, Effect } from "effect";
import { nanoid } from "nanoid";
import { prosemirrorJSONToYDoc } from "y-prosemirror";
import * as Y from "yjs";
import * as EventSchema from "../src/lib/event.schema";
import * as BackupSchema from "../src/lib/graph-backup/schema";
import { NOTE_SCHEMA } from "../src/lib/prosemirror/app-schema";
import { PROSEMIRROR_XML_FRAGMENT_KEY } from "../src/lib/prosemirror/yjs";
import { toLocalDateString } from "../src/lib/temporal/utils";
import { ENTRIES, PAGES, SOURCE_GRAPH_DISPLAY_NAME } from "./demo-content";
import type { Block, Inline, PageKey } from "./demo-content";

const outputPath = process.argv[2];

if (process.argv.length !== 3 || !outputPath) {
  console.error("Usage: tsx scripts/generate-demo-graph.ts <output-path>");
  process.exit(1);
}

const pageIds = Object.fromEntries(Object.keys(PAGES).map((key) => [key, nanoid()])) as Record<
  PageKey,
  string
>;

function inlineToJSON(inline: Inline) {
  if (typeof inline === "string") return { type: "text", text: inline };
  return { type: "backlink", attrs: { id: pageIds[inline.backlink] } };
}

function blockToJSON(block: Block) {
  if ("h1" in block) {
    return { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: block.h1 }] };
  }
  return { type: "paragraph", content: block.p.map(inlineToJSON) };
}

function buildPayload(blocks: Array<Block>): Uint8Array<ArrayBufferLike> {
  const yDoc = prosemirrorJSONToYDoc(
    NOTE_SCHEMA,
    { type: "doc", content: blocks.map(blockToJSON) },
    PROSEMIRROR_XML_FRAGMENT_KEY,
  );
  return Y.encodeStateAsUpdate(yDoc);
}

function event(
  noteId: string,
  type: "update" | "date",
  payload: Uint8Array<ArrayBufferLike>,
  createdAt: DateTime.Utc,
): BackupSchema.Record {
  return { noteId, type, payload, createdAt, id: nanoid() };
}

const now = DateTime.nowUnsafe();
const events: Array<BackupSchema.Record> = [];

// Pages are created first (oldest), staggered by a second so order is stable.
Object.entries(PAGES).forEach(([key, page], index) => {
  const createdAt = DateTime.add(DateTime.subtract(now, { days: 90 }), { seconds: index });
  events.push(event(pageIds[key as PageKey], "update", buildPayload(page.blocks), createdAt));
});

// Journal entries: an `update` event plus a `date` event pinning the day.
for (const entry of ENTRIES) {
  const noteId = nanoid();
  const createdAt = DateTime.subtract(now, { days: entry.daysAgo });
  const date = toLocalDateString(createdAt);
  const datePayload = Effect.runSync(EventSchema.encodeDatePayload({ date }));

  events.push(event(noteId, "update", buildPayload(entry.blocks), createdAt));
  events.push(event(noteId, "date", datePayload, DateTime.add(createdAt, { seconds: 1 })));
}

events.sort((a, b) => DateTime.toEpochMillis(a.createdAt) - DateTime.toEpochMillis(b.createdAt));

const bundle: BackupSchema.Bundle = {
  version: 1,
  exportedAt: now,
  sourceGraphDisplayName: SOURCE_GRAPH_DISPLAY_NAME,
  events,
};

const json = Effect.runSync(BackupSchema.encodeFile(bundle));
writeFileSync(outputPath, json);

console.log(
  `Wrote ${events.length} events (${Object.keys(PAGES).length} pages, ${ENTRIES.length} entries) to ${outputPath}`,
);
