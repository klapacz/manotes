import { AttrsSchema } from "./attrs.schema";
import { RECORD_SCHEMA } from "./prosemirror/app-schema";
import { MdSerialize } from "./prosemirror/md/serialize";
import { RecordRepo } from "./record.repo";
import { RecordSchema } from "./record.schema";
import { PlainDateString } from "./temporal.schema";
import {
  Array,
  DateTime,
  Effect,
  Match,
  Option,
  Predicate,
  Record,
  Result,
  Schema,
  Stream,
  pipe,
} from "effect";
import { BacklinkLabels } from "./backlink-labels";
import { ExecuteProps } from "./execute-props";
import { PropDef } from "./prop-def.service";
import { RecordFormat } from "./record/format";

const commonFields = {
  id: RecordSchema.Id,
  title: Schema.NullOr(Schema.String),
  text: Schema.String,
  date: PlainDateString,
  createdAt: Schema.String,
  updatedAt: Schema.String,
  markdown: Schema.String,
  snippets: Schema.Array(Schema.String),
  props: ExecuteProps.Groups,
};

export const ItemNote = Schema.TaggedStruct("note", commonFields);

export type ItemNote = typeof ItemNote.Type;

export const ItemProp = Schema.TaggedStruct("prop", {
  ...commonFields,
  prop_type: Schema.NullOr(AttrsSchema.PropValTag),
  prop_default: ExecuteProps.Value,
  prop_targets: Schema.NullOr(AttrsSchema.TargetFilter),
});

export type ItemProp = typeof ItemProp.Type;

export const ItemOwned = Schema.TaggedStruct("owned", {
  ...commonFields,
  owned_type: Schema.NullOr(Schema.Literal("enum_option")),
  owned_parent: Schema.NullOr(RecordSchema.Id),
});

export type ItemOwned = typeof ItemOwned.Type;

export const ItemRule = Schema.TaggedStruct("rule", {
  ...commonFields,
  rule_storage: Schema.NullOr(AttrsSchema.RuleStorage),
  rule_targets: Schema.NullOr(AttrsSchema.TargetFilter),
  rule_expects: Schema.Record(RecordSchema.Id, AttrsSchema.RuleExpectation),
});

export type ItemRule = typeof ItemRule.Type;

export const Item = Schema.Union([ItemNote, ItemProp, ItemOwned, ItemRule]).pipe(
  Schema.toTaggedUnion("_tag"),
);

export type Item = typeof Item.Type;

export const Format = Schema.Literals(["oneline", "short", "full"]);

export type Format = typeof Format.Type;

export const list = Effect.fn("CliList.list")(function* (opts: RecordRepo.ListOpts = {}) {
  const records = yield* RecordRepo.Service;
  const rows = yield* records.list(opts);

  if (rows.length === 0) return [];

  const def = yield* PropDef.Service;

  const defs = yield* def
    .reactiveDefs()
    .pipe(
      Effect.flatMap(Stream.runHead),
      Effect.flatMap(Effect.fromOption),
      Effect.map(PropDef.asRecord),
    );

  const labelRows = yield* records.listLabels();

  const labels = new Map(
    Array.map(labelRows, (row) => [row.id, RecordFormat.queryLabel(row)] as const),
  );

  // Markdown keeps the same labels as exported files and literal body edits.
  const backlinkLabels = BacklinkLabels.buildCache(labelRows);
  const rulesByRecord = yield* ExecuteProps.readRules(Array.map(rows, (row) => row.id));

  return yield* Effect.forEach(rows, (row) => {
    return Effect.gen(function* () {
      const rules = Record.get(rulesByRecord, row.id).pipe(Option.getOrElse(() => ({})));
      const props = yield* ExecuteProps.readGroups({ rows: row.props, defs, rules, labels });

      return yield* readItem({ row, props, labels, backlinkLabels });
    });
  });
});

export function format(format: Format, items: readonly Item[]): string {
  switch (format) {
    case "oneline":
      return items.map(formatHeader).join("\n");

    case "short":
      return items.map((item) => formatWithBody(item, item.snippets.join("\n\n"))).join("\n\n");

    case "full":
      return items
        .map((item) => {
          return formatWithBody(item, item.markdown, formatSettings(item));
        })
        .join("\n\n");
  }
}

const readItem = Effect.fn("CliList.readItem")(function* (opts: {
  readonly row: RecordRepo.ListRecord;
  readonly props: ExecuteProps.Groups;
  readonly labels: ReadonlyMap<RecordSchema.Id, string>;
  readonly backlinkLabels: ReadonlyMap<RecordSchema.Id, string>;
}) {
  const common = {
    id: opts.row.id,
    title: opts.row.title,
    text: opts.row.text,
    date: opts.row.date,
    createdAt: DateTime.formatIso(opts.row.createdAt),
    updatedAt: DateTime.formatIso(opts.row.updatedAt),
    props: opts.props,
    ...serializeContent(opts.row.content, {
      backlinkLabel: (id) => opts.backlinkLabels.get(id),
    }),
  };

  return yield* Match.value(opts.row._tag).pipe(
    Match.when("note", () => Effect.succeed(Item.cases.note.make(common))),
    Match.when("owned", () => {
      return Effect.succeed(
        Item.cases.owned.make({
          ...common,
          owned_type: opts.row.owned_type,
          owned_parent: opts.row.owned_parent,
        }),
      );
    }),
    Match.when("prop", () => {
      // TODO: Reconsider whether defaults need display labels and resolved record names.
      return ExecuteProps.readDefault({
        type: opts.row.prop_type,
        value: opts.row.prop_default,
        targets: opts.row.prop_targets,
        labels: opts.labels,
      }).pipe(
        Effect.map((propDefault) => {
          return Item.cases.prop.make({
            ...common,
            prop_type: opts.row.prop_type,
            prop_default: propDefault,
            prop_targets: opts.row.prop_targets,
          });
        }),
      );
    }),
    Match.when("rule", () => {
      return Effect.succeed(
        Item.cases.rule.make({
          ...common,
          rule_storage: opts.row.rule_storage,
          rule_targets: opts.row.rule_targets,
          rule_expects: pipe(
            opts.row.rule_expects,
            // Like the UI, omit expectations without a decoded value.
            Array.filterMap((row) => {
              if (row.value === null) return Result.fail(undefined);

              return Result.succeed([row.propId, row.value] as const);
            }),
            Record.fromEntries,
          ),
        }),
      );
    }),
    Match.exhaustive,
  );
});

function formatHeader(item: Item): string {
  return `${item.title ?? "Untitled"} ${item.id} ${item.date}`;
}

function formatWithBody(item: Item, body: string, settings = ""): string {
  const header = formatHeader(item);

  const content = pipe(
    [body, settings, formatProps(item.props)],
    Array.filter((section) => section.length > 0),
    Array.join("\n\n"),
  );

  if (content.length === 0) return header;

  const indented = content
    .split("\n")
    .map((line) => `  ${line}`)
    .join("\n");

  return `${header}\n\n${indented}`;
}

function formatProps(props: ExecuteProps.Groups): string {
  const lines = [
    ...Array.map(props.top, (prop) => {
      return `  ${formatPropRow({ prop, grouped: false })}`;
    }),
    ...Array.flatMap(props.groups, (group) => {
      return [
        `  ${formatPropGroupHeader(group)}:`,
        ...Array.map(group.props, (prop) => {
          return `    ${formatPropRow({ prop, grouped: true })}`;
        }),
      ];
    }),
  ];

  if (lines.length === 0) return "";

  return ["Props:", ...lines].join("\n");
}

function formatPropGroupHeader(group: ExecuteProps.RuleGroup): string {
  const label = `${group.label} [${group.ruleId}]`;

  return Match.value(group.status).pipe(
    Match.when("Matching", () => label),
    Match.when("Unmatched", () => `${label} (no longer applies)`),
    Match.when("Unavailable", () => `${label} (rule unavailable)`),
    Match.exhaustive,
  );
}

function formatPropRow(opts: {
  readonly prop: ExecuteProps.Entry;
  readonly grouped: boolean;
}): string {
  const unset = ExecuteProps.ValueState.guards.Unset(opts.prop.value.state);

  const annotations = pipe(
    {
      required: Predicate.isTagged(opts.prop.expectation, "required") && unset,
      unexpected: opts.grouped && opts.prop.expectation === null && !unset,
      "prop unavailable": opts.prop.def === null,
    },
    Record.filter((visible) => visible),
    Record.keys,
  );

  const row = `${opts.prop.label} [${opts.prop.propId}]: ` + formatPropValue(opts.prop.value);

  if (annotations.length === 0) return row;

  return `${row} (${annotations.join(", ")})`;
}

function formatPropValue(value: ExecuteProps.Value): string {
  return Match.value(value.state).pipe(
    Match.tag("Unset", () => "unset"),
    Match.tag("Valid", (state) => {
      return formatAssignedPropValue(state.value, value.label);
    }),
    Match.tag("Invalid", (state) => {
      if (state.value === undefined) return "invalid";

      return `invalid: ${formatAssignedPropValue(state.value, value.label)}`;
    }),
    Match.exhaustive,
  );
}

function formatAssignedPropValue(value: AttrsSchema.PropVal, label: string | null): string {
  return Match.value(value).pipe(
    Match.tag("text", (value) => JSON.stringify(value.val)),
    Match.tag("enum", "link", (value) => {
      return `${label ?? "Unavailable record"} [${value.val}]`;
    }),
    Match.orElse((value) => {
      return label ?? RecordFormat.propValueLabel(value);
    }),
  );
}

function formatSettings(item: Item): string {
  return Match.value(item).pipe(
    Match.tag("note", () => ""),
    Match.tag("prop", (item) => {
      const lines = [
        "Prop def:",
        `  Type: ${item.prop_type ?? "unset"}`,
        `  Default: ${formatPropValue(item.prop_default)}`,
      ];

      if (item.prop_type !== "link") return lines.join("\n");

      return [...lines, `  Targets: ${formatTargets(item.prop_targets ?? [])}`].join("\n");
    }),
    Match.tag("owned", (item) => {
      const parentLabel = Match.value(item.owned_parent).pipe(
        Match.when(null, () => "unset"),
        Match.orElse((id) => `[${id}]`),
      );

      return [
        "Owned record:",
        `  Type: ${item.owned_type ?? "unset"}`,
        `  Parent: ${parentLabel}`,
      ].join("\n");
    }),
    Match.tag("rule", (item) => {
      const targetsLabel = Match.value(item.rule_targets).pipe(
        Match.when(null, () => "unset"),
        Match.orElse(formatTargets),
      );

      const lines = [
        "Rule def:",
        `  Storage: ${item.rule_storage?._tag ?? "unset"}`,
        `  Targets: ${targetsLabel}`,
      ];

      const expects = Record.collect(item.rule_expects, (propId, expectation) => {
        return `    [${propId}]: ${expectation._tag}`;
      });

      if (expects.length === 0) return [...lines, "  Expects: none"].join("\n");

      return [...lines, "  Expects:", ...expects].join("\n");
    }),
    Match.exhaustive,
  );
}

function formatTargets(targets: AttrsSchema.TargetFilter): string {
  if (targets.length === 0) return "all records";

  return JSON.stringify(targets);
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
