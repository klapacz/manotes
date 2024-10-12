import type { JSONContent } from "@tiptap/core";
import type { ColumnType } from "kysely";

export type Database = {
  notes: NotesTable;
  backlinks: BacklinksTable;
  tags: TagsTable;
  notes_tags: NotesTagsTable;
};

export type NotesTable = {
  id: ColumnType<string, string, never>;
  title: ColumnType<string, string | undefined>;
  content: ColumnType<JSONContent, string, string>;
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
