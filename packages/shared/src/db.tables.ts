import { Column, Index, PrimaryKey, Query, Scalar, Table, Type } from "effect-qb";
import { Schema } from "effect";
import * as Sqlite from "effect-qb/sqlite";
import type { ColumnDefinition } from "effect-qb/internal/column-state";
import { ddlType } from "effect-qb/internal/column";
// oxlint-disable-next-line anti-slop/no-shape-in-symbol-names -- Upstream JSON type marker; alias describes its use here.
import type { StoredShape as StoredJson } from "effect-qb/internal/json/storage";
import * as EventSchema from "./event.schema";
import { AttrsSchema } from "./attrs.schema";
import { NoteSchema } from "./note.schema";
import * as TemporalSchema from "./temporal.schema";

export const notes = Table.make("notes", {
  id: Column.text().pipe(Column.schema(NoteSchema.Id), Column.primaryKey),
  _tag: Column.custom(AttrsSchema.RecordTag, Type.text()).pipe(
    Column.default(Query.literal("note")),
  ),
  prop_type: Column.custom(AttrsSchema.PropValTag, Type.text()).pipe(Column.nullable),
  prop_default: nullableJson(AttrsSchema.PropVal),
  prop_targets: nullableJson(AttrsSchema.TargetFilter),
  owned_type: Column.custom(Schema.Literal("enum_option"), Type.text()).pipe(Column.nullable),
  owned_parent: Column.text().pipe(Column.schema(NoteSchema.Id), Column.nullable),
  rule_storage: nullableJson(AttrsSchema.RuleStorage),
  rule_targets: nullableJson(AttrsSchema.TargetFilter),
  attrs_valid: Column.custom(Schema.BooleanFromBit, Type.int()).pipe(
    Column.default(Query.literal(0)),
  ),
  title: Column.text().pipe(Column.nullable),
  content: jsonText(NoteSchema.Content),
  text: Column.text(),
  date: Column.text().pipe(Column.schema(TemporalSchema.PlainDateString)),
  materializedYUpdate: Column.blob().pipe(Column.nullable),
  createdAt: Column.text().pipe(Column.schema(Schema.DateTimeUtcFromString)),
  updatedAt: Column.text().pipe(Column.schema(Schema.DateTimeUtcFromString)),
  lastEventLocalSeq: Column.int(),
})
  .pipe(Index.make((table) => [table._tag]).pipe(Index.named("notes_tag_idx")))
  .pipe(Index.make((table) => [table.owned_parent]).pipe(Index.named("notes_owned_parent_idx")));

export type Note = Table.SelectOf<typeof notes>;

// NULL preserves an unparseable assignment; an absent assignment has no row.
// References can arrive out of order, so these projections have no foreign keys.
export const props = Table.make("props", {
  recordId: Column.text().pipe(Column.schema(NoteSchema.Id)),
  path: jsonText(Schema.Array(NoteSchema.Id)),
  propId: Column.text().pipe(Column.schema(NoteSchema.Id)),
  value: nullableJson(AttrsSchema.PropVal),
})
  .pipe(PrimaryKey.make((table) => [table.recordId, table.path, table.propId]))
  .pipe(Index.make((table) => [table.propId]).pipe(Index.named("props_prop_id_idx")));

export type Prop = Table.SelectOf<typeof props>;

export const ruleExpects = Table.make("rule_expects", {
  ruleId: Column.text().pipe(Column.schema(NoteSchema.Id)),
  propId: Column.text().pipe(Column.schema(NoteSchema.Id)),
  value: nullableJson(AttrsSchema.RuleExpectation),
})
  .pipe(PrimaryKey.make((table) => [table.ruleId, table.propId]))
  .pipe(Index.make((table) => [table.propId]).pipe(Index.named("rule_expects_prop_id_idx")));

export type RuleExpect = Table.SelectOf<typeof ruleExpects>;

export const events = Table.make("events", {
  // SQLite allocates a monotonic row ID when omitted.
  localSeq: Column.int().pipe(Column.primaryKey, Sqlite.Column.autoIncrement),
  noteId: Column.text().pipe(Column.schema(Schema.NonEmptyString)),
  type: Column.custom(EventSchema.Type, Type.text()),
  payload: Column.blob(),
  createdAt: Column.text().pipe(Column.schema(Schema.DateTimeUtcFromString)),
  id: Column.text().pipe(Column.schema(Schema.NonEmptyString), Column.unique),
  commitSeq: Column.int().pipe(Column.nullable, Column.unique),
});

export type Event = Table.SelectOf<typeof events>;

export const materializationCheckpoint = Table.make("materialization_checkpoint", {
  id: Column.int().pipe(Column.primaryKey),
  lastAppliedLocalSeq: Column.int(),
  updatedAt: Column.text(),
});

export type MaterializationCheckpoint = Table.SelectOf<typeof materializationCheckpoint>;

export const backlinks = Table.make("backlinks", {
  sourceId: Column.text(),
  targetId: Column.text(),
})
  .pipe(PrimaryKey.make((table) => [table.sourceId, table.targetId]))
  .pipe(Index.make((table) => [table.targetId]).pipe(Index.named("backlinks_target_id_idx")));

export type Backlink = Table.SelectOf<typeof backlinks>;

// QB 0.24.1 inferred JSON types fail declaration emission with TS4023; keep this annotation.
type JsonColumn<S extends Schema.Top, Nullable extends boolean> = ColumnDefinition<
  S["Type"] | (Nullable extends true ? null : never),
  unknown,
  unknown,
  Scalar.DbType.Json<"standard", "json"> & { readonly [StoredJson]: Schema.Codec.Encoded<S> },
  Nullable,
  false,
  false,
  false,
  false,
  undefined
>;

function nullableJson<S extends Schema.Top>(schema: S): JsonColumn<S, true> {
  const column: JsonColumn<S, false> = Column.json(schema);

  return Column.nullable(column);
}

function jsonText<S extends Schema.Top>(schema: S): JsonColumn<S, false> {
  return Column.json(schema).pipe(ddlType("text"));
}

export * as Tables from "./db.tables";
