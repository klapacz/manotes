import { sqliteTable, text, integer, blob, primaryKey, index } from "drizzle-orm/sqlite-core";
import * as EventSchema from "./event.schema";
import { AttrsSchema } from "./attrs.schema";

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    _tag: text("_tag").$type<AttrsSchema.RecordTag>().notNull().default("note"),
    builtin: integer("builtin", { mode: "boolean" }).notNull().default(false),

    prop_type: text("prop_type").$type<AttrsSchema.PropValTag>(),
    prop_default: text("prop_default", { mode: "json" }).$type<AttrsSchema.PropVal>(),
    prop_targets: text("prop_targets", { mode: "json" }).$type<AttrsSchema.TargetFilter>(),

    owned_type:
      text("owned_type").$type<Extract<AttrsSchema.Attrs, { _tag: "owned" }>["owned_type"]>(),
    owned_parent: text("owned_parent").$type<AttrsSchema.NoteId>(),

    rule_targets: text("rule_targets", { mode: "json" }).$type<AttrsSchema.TargetFilter>(),

    // Strict attrs validity, separate from semantic property validation.
    attrs_valid: integer("attrs_valid", { mode: "boolean" }).notNull().default(false),

    title: text("title"),
    content: text("content").notNull(),
    text: text("text").notNull(),
    date: text("date").notNull(),

    materializedYUpdate: blob("materializedYUpdate", {
      mode: "buffer",
    }).$type<Uint8Array<ArrayBufferLike> | null>(),
    createdAt: text("createdAt").notNull(),
    updatedAt: text("updatedAt").notNull(),
    lastEventLocalSeq: integer("lastEventLocalSeq").notNull(),
  },
  (table) => [
    index("notes_tag_idx").on(table._tag),
    index("notes_owned_parent_idx").on(table.owned_parent),
  ],
);

// NULL preserves an unparseable assignment; an absent assignment has no row.
// References can arrive out of order, so these projections have no foreign keys.
export const props = sqliteTable(
  "props",
  {
    recordId: text("recordId").$type<AttrsSchema.NoteId>().notNull(),
    propId: text("propId").$type<AttrsSchema.NoteId>().notNull(),
    value: text("value", { mode: "json" }).$type<AttrsSchema.PropVal>(),
  },
  (table) => [
    primaryKey({ columns: [table.recordId, table.propId] }),
    index("props_prop_id_idx").on(table.propId),
  ],
);

export type PropRow = typeof props.$inferSelect;

export const ruleExpects = sqliteTable(
  "rule_expects",
  {
    ruleId: text("ruleId").$type<AttrsSchema.NoteId>().notNull(),
    propId: text("propId").$type<AttrsSchema.NoteId>().notNull(),
    value: text("value", { mode: "json" }).$type<AttrsSchema.RuleExpectation>(),
  },
  (table) => [
    primaryKey({ columns: [table.ruleId, table.propId] }),
    index("rule_expects_prop_id_idx").on(table.propId),
  ],
);

export type RuleExpectRow = typeof ruleExpects.$inferSelect;

export const events = sqliteTable("events", {
  localSeq: integer("localSeq").primaryKey({ autoIncrement: true }),
  noteId: text("noteId").notNull(),
  type: text("type", {
    enum: EventSchema.Type.literals,
  }).notNull(),
  payload: blob("payload", { mode: "buffer" })
    .$type<(typeof EventSchema.Record.Encoded)["payload"]>()
    .notNull(),
  createdAt: text("createdAt").notNull(),
  id: text("id").notNull().unique(),
  commitSeq: integer("commitSeq").unique(),
});

export const materializationCheckpoint = sqliteTable("materialization_checkpoint", {
  id: integer("id").primaryKey(),
  lastAppliedLocalSeq: integer("lastAppliedLocalSeq").notNull(),
  updatedAt: text("updatedAt").notNull(),
});

export const backlinks = sqliteTable(
  "backlinks",
  {
    sourceId: text("sourceId").notNull(),
    targetId: text("targetId").notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.sourceId, table.targetId] }),
    index("backlinks_target_id_idx").on(table.targetId),
  ],
);

export * as Tables from "./db.tables";
