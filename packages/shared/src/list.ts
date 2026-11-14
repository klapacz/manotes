import { RECORD_SCHEMA } from "./prosemirror/app-schema";
import { MdSerialize } from "./prosemirror/md/serialize";
import { RecordRepo } from "./record.repo";
import { RecordSchema } from "./record.schema";
import { PlainDateString } from "./temporal.schema";
import { DateTime, Effect, Schema } from "effect";
import { BacklinkLabels } from "./backlink-labels";

export const Item = Schema.Struct({
  id: RecordSchema.Id,
  title: Schema.NullOr(Schema.String),
  text: Schema.String,
  date: PlainDateString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  markdown: Schema.String,
  snippets: Schema.Array(Schema.String),
});

export type Item = typeof Item.Type;

export const Format = Schema.Literals(["oneline", "short", "full"]);

export type Format = typeof Format.Type;

export const list = Effect.fn("CliList.list")(function* (options: RecordRepo.ListOpts = {}) {
  const records = yield* RecordRepo.Service;
  const labels = yield* records.listLabels().pipe(Effect.map(BacklinkLabels.buildCache));

  return yield* records.list(options).pipe(
    Effect.map((rows) => {
      return rows.map(({ content, ...row }): Item => ({
        ...row,
        createdAt: DateTime.formatIso(row.createdAt),
        updatedAt: DateTime.formatIso(row.updatedAt),
        ...serializeContent(content, { backlinkLabel: (id) => labels.get(id) }),
      }));
    }),
  );
});

export function format(format: Format, items: readonly Item[]): string {
  switch (format) {
    case "oneline":
      return items.map(formatHeader).join("\n");

    case "short":
      return items.map((item) => formatWithBody(item, item.snippets.join("\n\n"))).join("\n\n");

    case "full":
      return items.map((item) => formatWithBody(item, item.markdown)).join("\n\n");
  }
}

function formatHeader(item: Item): string {
  return `${item.title ?? "Untitled"} ${item.id} ${item.date}`;
}

function formatWithBody(item: Item, body: string): string {
  const header = formatHeader(item);

  if (body.length === 0) return header;

  const indented = body
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

  return `${header}\n\n${indented}`;
}

/**
 * Convert the stored editor JSON to Markdown for list display.
 * `markdown` supplies the complete body for "full"; `snippets` supplies
 * the first content block for "short", skipping headings shown in the header.
 */
function serializeContent(
  content: RecordRepo.Record["content"],
  options: MdSerialize.Options,
): Pick<Item, "markdown" | "snippets"> {
  const doc = RECORD_SCHEMA.nodeFromJSON(content);
  const { markdown, blocks } = MdSerialize.withBlockSpans(doc, options);

  const first = blocks.find((_, index) => {
    const node = doc.child(index);

    if (node.type.name === "heading") return false;

    if (node.type.name === "paragraph" && node.content.size === 0) return false;

    return true;
  });

  const snippets: string[] = [];

  if (first !== undefined) snippets.push(markdown.slice(first.mdFrom, first.mdTo).trim());

  return { markdown, snippets };
}

export * as CliList from "./list";
