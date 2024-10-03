import type { ColumnType, Generated } from "kysely";
import type { RemirrorJSON } from "remirror";

export type Database = {
  notes: NotesTable;
};

export type NotesTable = {
  id: Generated<number>;
  title: ColumnType<string, string | undefined>;
  content: ColumnType<RemirrorJSON, string, string>;
};
