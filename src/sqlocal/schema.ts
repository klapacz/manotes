import type { JSONContent } from "@tiptap/core";
import type { ColumnType } from "kysely";

export type Database = {
  notes: NotesTable;
  backlinks: BacklinksTable;
};

export type NotesTable = {
  id: ColumnType<string, string, never>;
  title: ColumnType<string, string | undefined>;
  content: ColumnType<JSONContent, string, string>;
};

export type BacklinksTable = {
  source_id: ColumnType<string, string, never>;
  target_id: ColumnType<string, string, never>;
};
