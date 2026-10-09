import { Record, Schema } from "effect";
import { NoteSchema } from "./note.schema";
import { PlainDateString } from "./temporal.schema";
import { YSchema } from "./y-schema";

/*
 * Note identities
 *
 * Reuse the shared note ID before defining values that refer to notes.
 */
export const NoteId = NoteSchema.Id;

export type NoteId = typeof NoteId.Type;

/*
 * Property values
 *
 * Definitions, assignments and comparisons all use these value cases.
 */
export const PropVal = Schema.TaggedUnion({
  text: { val: Schema.String },
  number: { val: Schema.Finite },
  bool: { val: Schema.Boolean },
  enum: { val: NoteId },
  link: { val: NoteId },
});

export type PropVal = typeof PropVal.Type;

export const PropValTag = Schema.Literals(Record.keys(PropVal.cases));

export type PropValTag = PropVal["_tag"];

/*
 * Record categories
 *
 * Shared fields and record tags must exist before filters can compare them.
 */
const common = {
  builtin: Schema.optionalKey(Schema.Boolean),
  props: YSchema.Map({ schema: Schema.Record(NoteId, PropVal), key: "propId" }),
};

const records = Schema.TaggedUnion({
  note: common,
  prop: common,
  owned: common,
  rule: common,
});

export const RecordTag = Schema.Literals(Record.keys(records.cases));

export type RecordTag = typeof RecordTag.Type;

/*
 * Filter expressions
 *
 * Filters depend on IDs, value cases and record tags. Definitions and rules use them below.
 */
const PropTarget = Schema.Tuple([Schema.Literal("prop"), NoteId]);

export const TargetFilterCmp = Schema.Union([
  Schema.Tuple([Schema.Literal("_tag"), Schema.Literal("="), RecordTag]),
  Schema.Tuple([Schema.Literal("title"), Schema.Literal("exists"), Schema.Boolean]),
  Schema.Tuple([Schema.Literal("body"), Schema.Literal("contains"), Schema.String]),
  Schema.Tuple([Schema.Literal("date"), Schema.Literal("="), PlainDateString]),
  Schema.Tuple([
    Schema.Tuple([Schema.Literal("link"), Schema.Literals(["->", "<-"]), NoteId]),
    Schema.Literal("exists"),
    Schema.Literal(true),
  ]),
  Schema.Tuple([PropTarget, Schema.Literal("="), PropVal]),
  Schema.Tuple([PropTarget, Schema.Literal("exists"), Schema.Boolean]),
]);

export type TargetFilterCmp = typeof TargetFilterCmp.Type;

// Only general stream filters can depend on validation; target filters cannot.
export const FilterCmp = Schema.Union([
  ...TargetFilterCmp.members,
  Schema.Tuple([PropTarget, Schema.Literal("invalid"), Schema.Boolean]),
]);

export type FilterCmp = typeof FilterCmp.Type;

export type FilterExpr<Cmp = FilterCmp> =
  | { readonly _tag: "and" | "or"; readonly val: readonly FilterExpr<Cmp>[] }
  | { readonly _tag: "cmp"; readonly val: Cmp };

export const FilterExpr = filterExpr(FilterCmp);

export const TargetFilterExpr = filterExpr(TargetFilterCmp);

export type TargetFilterExpr = typeof TargetFilterExpr.Type;

export const Filter = Schema.Array(FilterExpr);

export type Filter = typeof Filter.Type;

export const TargetFilter = Schema.Array(TargetFilterExpr);

export type TargetFilter = typeof TargetFilter.Type;

function filterExpr<
  const Members extends readonly Schema.ConstraintCodec<unknown, unknown, never, never>[],
>(cmp: Schema.Union<Members>) {
  type Cmp = Schema.Union<Members>;

  const expr: Schema.Codec<
    FilterExpr<Cmp["Type"]>,
    FilterExpr<Cmp["Encoded"]>
  > = Schema.TaggedUnion({
    and: { val: Schema.Array(Schema.suspend(() => expr)) },
    or: { val: Schema.Array(Schema.suspend(() => expr)) },
    cmp: { val: cmp },
  });

  return expr;
}

/*
 * Expectations and property definitions
 *
 * Combine the value cases with filters before composing the complete record union.
 */
export const RuleExpectation = Schema.TaggedUnion({
  required: {},
  optional: {},
});

export type RuleExpectation = typeof RuleExpectation.Type;

const PropAttrs = Schema.Union([
  propAttrs(PropVal.cases.text),
  propAttrs(PropVal.cases.number),
  propAttrs(PropVal.cases.bool),
  propAttrs(PropVal.cases.enum),
  propAttrs(PropVal.cases.link).mapFields((fields) => ({
    ...fields,
    prop_targets: Schema.optionalKey(TargetFilter),
  })),
]).pipe(Schema.toTaggedUnion("prop_type"));

function propAttrs<const Tag extends PropValTag, const Value extends Schema.Constraint>(
  value: Schema.TaggedStruct<Tag, { readonly val: Value }>,
) {
  return Schema.Struct({
    ...records.cases.prop.fields,
    prop_type: value.fields._tag,
    prop_default: Schema.optionalKey(value),
  });
}

/**
 * Record schema
 *
 * Compose the complete record schema after all field schemas have been defined.
 *
 * Resolved JSON schema. Decoded and encoded values have the same shape:
 *
 * ```ts
 * type PropVal =
 *   | { readonly _tag: "text"; readonly val: string }
 *   | { readonly _tag: "number"; readonly val: number }
 *   | { readonly _tag: "bool"; readonly val: boolean }
 *   | { readonly _tag: "enum"; readonly val: NoteId }
 *   | { readonly _tag: "link"; readonly val: NoteId };
 *
 * type Attrs =
 *   | {
 *       readonly _tag: "note";
 *       // Shared
 *       readonly builtin?: boolean;
 *       readonly props: Readonly<Record<NoteId, PropVal>>; // Y.Map in live Yjs; each entry is atomic JSON.
 *     }
 *   | {
 *       readonly _tag: "prop";
 *       readonly prop_type: "text";
 *       readonly prop_default?: { readonly _tag: "text"; readonly val: string };
 *       // Shared
 *       readonly builtin?: boolean;
 *       readonly props: Readonly<Record<NoteId, PropVal>>; // Y.Map in live Yjs; each entry is atomic JSON.
 *     }
 *   | {
 *       readonly _tag: "prop";
 *       readonly prop_type: "number";
 *       readonly prop_default?: { readonly _tag: "number"; readonly val: number };
 *       // Shared
 *       readonly builtin?: boolean;
 *       readonly props: Readonly<Record<NoteId, PropVal>>; // Y.Map in live Yjs; each entry is atomic JSON.
 *     }
 *   | {
 *       readonly _tag: "prop";
 *       readonly prop_type: "bool";
 *       readonly prop_default?: { readonly _tag: "bool"; readonly val: boolean };
 *       // Shared
 *       readonly builtin?: boolean;
 *       readonly props: Readonly<Record<NoteId, PropVal>>; // Y.Map in live Yjs; each entry is atomic JSON.
 *     }
 *   | {
 *       readonly _tag: "prop";
 *       readonly prop_type: "enum";
 *       readonly prop_default?: { readonly _tag: "enum"; readonly val: NoteId };
 *       // Shared
 *       readonly builtin?: boolean;
 *       readonly props: Readonly<Record<NoteId, PropVal>>; // Y.Map in live Yjs; each entry is atomic JSON.
 *     }
 *   | {
 *       readonly _tag: "prop";
 *       readonly prop_type: "link";
 *       readonly prop_default?: { readonly _tag: "link"; readonly val: NoteId };
 *       readonly prop_targets?: TargetFilter; // Atomic JSON; invalid predicates are forbidden.
 *       // Shared
 *       readonly builtin?: boolean;
 *       readonly props: Readonly<Record<NoteId, PropVal>>; // Y.Map in live Yjs; each entry is atomic JSON.
 *     }
 *   | {
 *       readonly _tag: "owned";
 *       readonly owned_type: "enum_option";
 *       readonly owned_parent: NoteId;
 *       // Shared
 *       readonly builtin?: boolean;
 *       readonly props: Readonly<Record<NoteId, PropVal>>; // Y.Map in live Yjs; each entry is atomic JSON.
 *     }
 *   | {
 *       readonly _tag: "rule";
 *       readonly rule_targets: TargetFilter; // Atomic JSON; invalid predicates are forbidden.
 *       readonly rule_expects: Readonly<Record<NoteId, // Y.Map in live Yjs; each entry is atomic JSON.
 *         { readonly _tag: "required" } | { readonly _tag: "optional" }
 *       >>;
 *       // Shared
 *       readonly builtin?: boolean;
 *       readonly props: Readonly<Record<NoteId, PropVal>>; // Y.Map in live Yjs; each entry is atomic JSON.
 *     };
 * ```
 *
 * NoteId is the shared branded note ID; numeric values must be finite. Dates use
 * PlainDateString. Target filters reject invalid predicates at every nesting level.
 */
export const Attrs = Schema.Union([
  records.cases.note,
  PropAttrs,
  Schema.Struct({
    ...records.cases.owned.fields,
    owned_type: Schema.Literal("enum_option"),
    owned_parent: NoteId,
  }),
  Schema.Struct({
    ...records.cases.rule.fields,
    rule_targets: TargetFilter,
    rule_expects: YSchema.Map({ schema: Schema.Record(NoteId, RuleExpectation), key: "propId" }),
  }),
]);

export type Attrs = typeof Attrs.Type;

export * as AttrsSchema from "./attrs.schema";
