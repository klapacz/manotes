import { AttrsSchema } from "./attrs.schema";
import { DB } from "./db.service";
import { Tables } from "./db.tables";
import { RECORD_SCHEMA } from "./prosemirror/app-schema";
import { MdSerialize } from "./prosemirror/md/serialize";
import type { RecordRepo } from "./record.repo";
import { RecordSchema } from "./record.schema";
import { RecordFilter } from "./record/filter";
import { PlainDateString } from "./temporal.schema";
import { DateTime, Effect, flow, identity, Schema, Struct } from "effect";
import { Query } from "effect-qb";
import { BacklinkLabels } from "./backlink-labels";

export const Options = Schema.Struct({
  filter: Schema.optionalKey(AttrsSchema.Filter),
  sort: Schema.optionalKey(Schema.Literals(["date", "updated"])),
  limit: Schema.optionalKey(Schema.Int.check(Schema.isGreaterThanOrEqualTo(1))),
});

export type Options = typeof Options.Type;

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

export const list = Effect.fn("CliList.list")(function* (options: Options = {}) {
  const db = yield* DB.Service;

  const labels = yield* Query.select(Struct.pick(Tables.records, ["id", "title", "text"])).pipe(
    Query.from(Tables.records),
    db.query,
    Effect.map(BacklinkLabels.buildCache),
  );

  return yield* Query.select(
    Struct.pick(Tables.records, [
      "id",
      "title",
      "text",
      "date",
      "createdAt",
      "updatedAt",
      "content",
    ]),
  ).pipe(
    Query.from(Tables.records),
    Query.where(RecordFilter.filterPredicate(options.filter ?? [])),
    options.sort === "updated"
      ? Query.orderBy(Tables.records.updatedAt, "desc")
      : flow(
          Query.orderBy(Tables.records.date, "desc"),
          Query.orderBy(Tables.records.createdAt, "desc"),
        ),
    Query.orderBy(Tables.records.id, "asc"),
    options.limit === undefined ? identity : Query.limit(options.limit),
    db.query,
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
