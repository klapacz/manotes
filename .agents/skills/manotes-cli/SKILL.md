---
name: manotes-cli
description: Query, display, create, and edit Manotes records through sandboxed JavaScript, then sync changes.
---

# Manotes CLI

Use the current directory unless told otherwise. Consult `manotes init --help` for setup.
Run plain JavaScript with top-level `await` using `manotes execute script.js` or stdin:

```sh
manotes execute <<'JS'
await api.showList("short", await api.list({ limit: 10 }));
JS
```

Scripts cannot import modules or access the filesystem, network, or Node globals.
The following TypeScript describes the API; scripts themselves must be JavaScript.

## API

```ts
type RecordId = string; // Non-empty, without the .md suffix.
type RecordTag = "note" | "prop" | "owned" | "rule";
type PropType = "text" | "number" | "bool" | "enum" | "link";

type PropValue =
  | { _tag: "text"; val: string }
  | { _tag: "number"; val: number } // Finite.
  | { _tag: "bool"; val: boolean }
  | { _tag: "enum" | "link"; val: RecordId };

type PropertyTarget = ["prop", RecordId];
type LinkTarget = ["link", "->" | "<-", RecordId];

type Cmp =
  | ["id", "=", RecordId]
  | ["_tag", "=", RecordTag] // "note" includes ordinary notes and pages.
  | ["title", "exists", boolean] // Pages have a title; ordinary notes do not.
  | ["body", "contains", string] // Literal text, including titles.
  | ["date", "=", string] // Valid YYYY-MM-DD assigned date.
  | ["prop_type", "=", PropType]
  | ["owned_type", "=", "enum_option"]
  | ["owned_parent", "=", RecordId]
  | [LinkTarget, "exists", true] // -> links to ID; <- is linked from ID.
  | [PropertyTarget, "=", PropValue] // Uses the definition's default when unset.
  | [PropertyTarget, "exists", boolean] // Explicit assignments; defaults do not count.
  | [PropertyTarget, "invalid", boolean]; // Not implemented; currently matches nothing.

type FilterExpr =
  | { _tag: "cmp"; val: Cmp }
  | { _tag: "and" | "or"; val: readonly FilterExpr[] };

type Filter = readonly FilterExpr[]; // Root is AND. [] matches everything.

type ListOptions = {
  filter?: Filter; // Default []. Includes all record kinds and archived records.
  sort?: "date" | "updated"; // Default "date", descending.
  limit?: number; // Positive integer; omitted means all matches. Applied after sorting.
};

type ListItem = {
  id: RecordId;
  title: string | null;
  text: string; // Plain text, including the title.
  date: string; // Logical assigned date, YYYY-MM-DD.
  createdAt: string; // Creation time, ISO 8601 UTC.
  updatedAt: string; // Last update, ISO 8601 UTC.
  markdown: string; // Complete Markdown body, without exported frontmatter.
  snippets: readonly string[]; // Leading Markdown snippet, or []. Not search matches.
};

type ListFormat =
  | "oneline" // Title, ID, assigned ISO date. Missing title prints "Untitled".
  | "short" // Same header, then Markdown snippets.
  | "full"; // Same header, then the complete Markdown body.

type UpdateOp =
  | { kind: "replace"; text: string; with: string; occurrence?: number | "all" }
  | { kind: "append"; markdown: string }
  | { kind: "date"; date: string }; // Valid YYYY-MM-DD.

type CreateOp = Extract<UpdateOp, { kind: "append" | "date" }>;

interface Api {
  list(options?: ListOptions): Promise<readonly ListItem[]>;
  showList(format: ListFormat, items: readonly ListItem[]): Promise<void>;
  createRecord(id: RecordId | undefined, ops: readonly CreateOp[]): Promise<RecordId>;
  editRecord(id: RecordId, ops: readonly UpdateOp[]): Promise<void>;
}
```

Use `showList` for formatted output or `text(records)` for JSON.
Avoid mixing `showList` with `text()` or `console.log()` in the same script;
their output can appear out of order.

## Query examples

```js
// Ten newest ordinary notes, including archived ones.
const recent = await api.list({
  filter: [
    { _tag: "cmp", val: ["_tag", "=", "note"] },
    { _tag: "cmp", val: ["title", "exists", false] },
  ],
  sort: "date",
  limit: 10,
});
await api.showList("short", recent);
```

```js
// Text AND outgoing link AND unarchived. IDs do not include .md.
const matches = await api.list({
  filter: [
    { _tag: "cmp", val: ["_tag", "=", "note"] },
    { _tag: "cmp", val: ["body", "contains", "literal text"] },
    { _tag: "cmp", val: [["link", "->", "project-id"], "exists", true] },
    {
      _tag: "cmp",
      val: [["prop", "builtin:archived"], "=", { _tag: "bool", val: false }],
    },
  ],
  limit: 3,
});
await api.showList("short", matches);
```

```js
// Nested alternatives: a dated record OR a page containing a phrase.
const alternatives = await api.list({
  filter: [{
    _tag: "or",
    val: [
      { _tag: "cmp", val: ["date", "=", "2026-11-08"] },
      { _tag: "and", val: [
        { _tag: "cmp", val: ["title", "exists", true] },
        { _tag: "cmp", val: ["body", "contains", "draft"] },
      ] },
    ],
  }],
});
await api.showList("oneline", alternatives);
```

```js
// Additional JS selection runs before the result limit.
const candidates = await api.list({
  filter: [{ _tag: "cmp", val: [["link", "->", "project-id"], "exists", true] }],
});
const selected = candidates
  .filter(record => record.date >= "2026-11-01" && record.date < "2026-12-01")
  .slice(0, 5);
await api.showList("full", selected);

// Custom output.
console.log(selected.map(record => `${record.id}\t${record.date}`).join("\n"));
```

## Create and edit examples

Notes capture thoughts, ideas, and experiences. Pages are notes with an H1 heading representing an entity.
Default to an ordinary note without an H1 for capture. Use an H1 when creating a page.

```js
// Create with a generated ID. Date defaults to today.
const id = await api.createRecord(undefined, [
  { kind: "append", markdown: "First paragraph." },
  { kind: "date", date: "2026-11-08" },
]);
await api.editRecord(id, [
  { kind: "replace", text: "First", with: "Updated" },
  { kind: "append", markdown: "\n## Next steps\n\n- Review the plan." },
]);
```

```js
// Inspect matches before running a batch edit.
const records = await api.list({
  filter: [{ _tag: "cmp", val: ["id", "=", "record-id"] }],
});
for (const record of records) {
  await api.editRecord(record.id, [
    { kind: "replace", text: "TODO", with: "DONE", occurrence: "all" },
  ]);
}
```

Body replacements match literal Markdown. Omit `occurrence` for exactly one match,
use a zero-based index for one occurrence, or `"all"` for all. Use `with: ""` to delete text.
Edits run in order. Each awaited create/edit call saves independently; earlier calls survive a later failure.
Creation accepts an unused explicit ID or `undefined`. IDs starting with `builtin:` are reserved.
Read `<record-id>.md` files when needed, but never edit them or `.manotes/` directly.

## Sync

`manotes sync` publishes local edits and downloads remote changes.
`manotes execute` can auto-sync pending changes when auto-sync is enabled,
including when the script only reads records.
