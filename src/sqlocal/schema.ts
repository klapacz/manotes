import type { JSONContent } from "@tiptap/core";
import type { ColumnType, Generated } from "kysely";

export type Database = {
  notes: NotesTable;
};

export type NotesTable = {
  id: Generated<number>;
  title: ColumnType<string, string | undefined>;
  content: ColumnType<JSONContent, string, string>;
};
