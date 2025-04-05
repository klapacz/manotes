import type { ColumnType } from "kysely";
import { VectorClock } from "worker/do/schema";

export type Database = {
  notes: NotesTable;
  backlinks: BacklinksTable;
  tags: TagsTable;
  notes_tags: NotesTagsTable;
};

export type NotesTable = {
  id: ColumnType<string, string, never>;
  title: ColumnType<string, string | undefined>;
  vector_clock: ColumnType<VectorClock, string, string>;
  content: ColumnType<Uint8Array, Uint8Array, Uint8Array>; // Binary YDoc state
  daily_at: ColumnType<string | null>;
};

export type BacklinksTable = {
  source_id: ColumnType<string, string, never>;
  target_id: ColumnType<string, string, never>;
};

export type TagsTable = {
  id: ColumnType<string, string, never>;
  name: ColumnType<string>;
};

export type NotesTagsTable = {
  note_id: ColumnType<string, string, never>;
  tag_id: ColumnType<string, string, never>;
};
