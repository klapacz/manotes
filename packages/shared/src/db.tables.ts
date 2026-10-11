import { sqliteTable, text, integer, blob, primaryKey, index } from "drizzle-orm/sqlite-core";
import * as EventSchema from "./event.schema";
import { AttrsSchema } from "./attrs.schema";

export const notes = sqliteTable(
  "notes",
  {
    id: text("id").primaryKey(),
    _tag: text("_tag").$type<AttrsSchema.RecordTag>().notNull().default("note"),
    builtin: integer("builtin").$type<0 | 1>().notNull().default(0),

    prop_type: text("prop_type").$type<AttrsSchema.PropValTag>(),
    prop_default: text("prop_default"),
    prop_targets: text("prop_targets"),

    owned_type:
      text("owned_type").$type<Extract<AttrsSchema.Attrs, { _tag: "owned" }>["owned_type"]>(),
    owned_parent: text("owned_parent"),

    rule_targets: text("rule_targets"),

    // Strict attrs validity, separate from semantic property validation.
    attrs_valid: integer("attrs_valid").notNull().default(0),

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
    recordId: text("recordId").notNull(),
    propId: text("propId").notNull(),
    value: text("value"),
  },
  (table) => [
    primaryKey({ columns: [table.recordId, table.propId] }),
    index("props_prop_id_idx").on(table.propId),
  ],
);

export const ruleExpects = sqliteTable(
  "rule_expects",
  {
    ruleId: text("ruleId").notNull(),
    propId: text("propId").notNull(),
    value: text("value"),
  },
  (table) => [
    primaryKey({ columns: [table.ruleId, table.propId] }),
    index("rule_expects_prop_id_idx").on(table.propId),
  ],
);

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
