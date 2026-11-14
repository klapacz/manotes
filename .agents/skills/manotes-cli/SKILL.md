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
  | { _tag: "enum"; val: RecordId }
  | { _tag: "link"; val: RecordId };

type PropTarget = ["prop", RecordId];
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
  | [PropTarget, "=", PropValue] // Uses the definition's default when unset.
  | [PropTarget, "exists", boolean] // Explicit assignments; defaults do not count.
  | [PropTarget, "invalid", boolean]; // Not implemented; currently matches nothing.

type FilterExpr =
  | { _tag: "cmp"; val: Cmp }
  | { _tag: "and" | "or"; val: readonly FilterExpr[] };

type Filter = readonly FilterExpr[]; // Root is AND. [] matches everything.

type TargetFilterExpr =
  | { _tag: "cmp"; val: Exclude<Cmp, [PropTarget, "invalid", boolean]> }
  | { _tag: "and" | "or"; val: readonly TargetFilterExpr[] };

type TargetFilter = readonly TargetFilterExpr[];
type RuleExpectation = { _tag: "required" | "optional" };
type RuleStorage = { _tag: "top" | "group" };

type PropDef = { id: RecordId; title: string | null } & (
  | { prop_type: "text"; prop_default: { _tag: "text"; val: string } | null }
  | { prop_type: "number"; prop_default: { _tag: "number"; val: number } | null }
  | { prop_type: "bool"; prop_default: { _tag: "bool"; val: boolean } | null }
  | { prop_type: "enum"; prop_default: { _tag: "enum"; val: RecordId } | null }
  | {
      prop_type: "link";
      prop_default: { _tag: "link"; val: RecordId } | null;
      prop_targets: TargetFilter | null;
    }
);

type ValueState =
  | { _tag: "Unset" }
  | { _tag: "Valid"; value: PropValue }
  | { _tag: "Invalid"; value?: PropValue };

type Value = { state: ValueState; label: string | null };

type PropEntry = {
  propId: RecordId;
  label: string;
  def: PropDef | null;
  expectation: RuleExpectation | null;
  value: Value;
};

type PropGroups = {
  top: readonly PropEntry[];
  groups: readonly {
    ruleId: RecordId;
    label: string;
    status: "Matching" | "Unmatched" | "Unavailable";
    props: readonly PropEntry[];
  }[];
};

type ListOpts = {
  filter?: Filter; // Default []. Includes all record kinds and archived records.
  sort?: "date" | "updated"; // Default "date", descending.
  limit?: number; // Positive integer; omitted means all matches. Applied after sorting.
};

type CommonItem = {
  id: RecordId;
  title: string | null;
  text: string; // Plain text, including the title.
  date: string; // Logical assigned date, YYYY-MM-DD.
  createdAt: string; // Creation time, ISO 8601 UTC.
  updatedAt: string; // Last update, ISO 8601 UTC.
  markdown: string; // Complete Markdown body, without exported frontmatter.
  snippets: readonly string[]; // Leading Markdown snippet, or []. Not search matches.
  props: PropGroups; // Saved assignments and expected properties, including unset ones.
};

type ListItem = CommonItem & (
  | { _tag: "note" }
  | {
      _tag: "prop";
      prop_type: PropType | null;
      prop_default: Value;
      prop_targets: TargetFilter | null;
    }
  | { _tag: "owned"; owned_type: "enum_option" | null; owned_parent: RecordId | null }
  | {
      _tag: "rule";
      rule_storage: RuleStorage | null;
      rule_targets: TargetFilter | null;
      rule_expects: Readonly<Record<RecordId, RuleExpectation>>;
    }
);

type ListFormat =
  | "oneline" // Title, ID, assigned ISO date. Missing title prints "Untitled".
  | "short" // Header, Markdown snippets, then grouped props.
  | "full"; // Header, complete Markdown body, kind-specific settings, then grouped props.

type UpdateOp =
  | { kind: "body.replace"; text: string; with: string; occurrence?: number | "all" }
  | { kind: "body.append"; markdown: string }
  | { kind: "date.set"; date: string }; // Valid YYYY-MM-DD.

type CreateOp = Extract<UpdateOp, { kind: "body.append" | "date.set" }>;

interface Api {
  list(options?: ListOpts): Promise<readonly ListItem[]>;
  listProps(): Promise<readonly PropDef[]>; // Available definitions, including built-ins.
  showList(format: ListFormat, items: readonly ListItem[]): Promise<void>;
  createRecord(id: RecordId | undefined, ops: readonly CreateOp[]): Promise<RecordId>;
  editRecord(id: RecordId, ops: readonly UpdateOp[]): Promise<void>;
}
```

Use `showList` for formatted bodies and props. `full` also shows prop defs, owned-record
settings and rule settings. Use `text(records)` for the structured fields.
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

## Read properties and rules

```js
// Discover property IDs, types, defaults and link filters.
text(await api.listProps());
```

```js
// Inspect saved and expected properties on one record.
const records = await api.list({
  filter: [{ _tag: "cmp", val: ["id", "=", "record-id"] }],
});
await api.showList("full", records);
```

```js
// Inspect rule filters, storage and property expectations.
const rules = await api.list({
  filter: [{ _tag: "cmp", val: ["_tag", "=", "rule"] }],
});
await api.showList("full", rules);
```

```js
// Discover options for an enum property. Use IDs returned by listProps().
const options = await api.list({
  filter: [
    { _tag: "cmp", val: ["owned_type", "=", "enum_option"] },
    { _tag: "cmp", val: ["owned_parent", "=", "status-property-id"] },
  ],
});
text(options);
```

For link choices, pass the definition's `prop_targets` to `list({ filter })`.
A null target filter means any record. Assigned values keep their saved form;
`value.state` reports validity and `value.label` supplies the displayed value.
Required expectations can appear with `Unset` values. Empty rule groups are omitted.
Text output includes prop, rule and referenced-record IDs in brackets. Group warnings
show rules that no longer apply or are unavailable. Prop rows mark required unset values,
unexpected assignments and unavailable defs. Text values use quotes and escaped newlines;
invalid values are marked and keep any available contents. Full settings show target
filters as exact API JSON, or `all records` for an empty filter.
This API currently reads property data; property assignment operations are not available.

## Create and edit examples

Notes capture thoughts, ideas, and experiences. Pages are notes with an H1 heading representing an entity.
Default to an ordinary note without an H1 for capture. Use an H1 when creating a page.

```js
// Create with a generated ID. Date defaults to today.
const id = await api.createRecord(undefined, [
  { kind: "body.append", markdown: "First paragraph." },
  { kind: "date.set", date: "2026-11-08" },
]);
await api.editRecord(id, [
  { kind: "body.replace", text: "First", with: "Updated" },
  { kind: "body.append", markdown: "\n## Next steps\n\n- Review the plan." },
]);
```

```js
// Inspect matches before running a batch edit.
const records = await api.list({
  filter: [{ _tag: "cmp", val: ["id", "=", "record-id"] }],
});
for (const record of records) {
  await api.editRecord(record.id, [
    { kind: "body.replace", text: "TODO", with: "DONE", occurrence: "all" },
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
