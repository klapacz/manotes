import { and, eq, sql, type SQL } from "drizzle-orm";
import type { AttrsSchema } from "./attrs.schema";
import { Tables } from "./db.tables";
import type { NoteSchema } from "./note.schema";

export function equals(opts: {
  readonly propId: NoteSchema.Id;
  readonly value: AttrsSchema.PropVal;
  readonly defaultValue: SQL; // JSON value from code or a definition column.
}) {
  const assignment = and(
    eq(Tables.props.recordId, Tables.notes.id),
    eq(Tables.props.propId, opts.propId),
  );

  // SQLite extracts numbers, strings and booleans in their SQL representation.
  const requested = sql`json_extract(${JSON.stringify(opts.value)}, '$.val')`;

  return sql`(
    EXISTS (
      SELECT 1 FROM ${Tables.props}
      WHERE ${assignment}
        AND json_extract(${Tables.props.value}, '$._tag') = ${opts.value._tag}
        AND json_extract(${Tables.props.value}, '$.val') = ${requested}
    )
    OR (
      NOT EXISTS (
        SELECT 1 FROM ${Tables.props}
        WHERE ${assignment}
      )
      AND json_extract(${opts.defaultValue}, '$.val') = ${requested}
    )
  )`;
}

export * as PropFilterSql from "./prop-filter.sql";
