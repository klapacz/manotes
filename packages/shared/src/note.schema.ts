import { Schema } from "effect";
import type { UnknownNodeJSON } from "./node-json";
import type { Tables } from "./db.tables";

export const Id = Schema.NonEmptyString.pipe(Schema.brand("NoteId"));

export type Id = typeof Id.Type;

export const CreateId = Schema.NonEmptyString.pipe(
  Schema.check(
    Schema.makeFilter((id) => {
      return id.startsWith("builtin:") ? "Record IDs cannot start with builtin:" : undefined;
    }),
  ),
);

// eslint-disable-next-line manotes/no-type-predicates -- This opaque ProseMirror schema preserves the editor-owned JSON contract; it deliberately performs no validation.
export const Content = Schema.declare<UnknownNodeJSON>((_x): _x is UnknownNodeJSON => true);

export type Record = Pick<
  Tables.Note,
  | "id"
  | "title"
  | "content"
  | "text"
  | "date"
  | "materializedYUpdate"
  | "createdAt"
  | "updatedAt"
  | "lastEventLocalSeq"
>;

export type MaterializedYUpdate = Record["materializedYUpdate"];

export type Preview = Pick<Record, "id" | "title" | "text" | "date" | "createdAt" | "updatedAt">;

/** One-shot editor boot payload — read atomically once; events drive the doc afterwards. */
export type BootRecord = Pick<Record, "materializedYUpdate" | "lastEventLocalSeq">;

/** Ordering/grouping metadata for stream lists; content stays out of list queries. */
export type Meta = Pick<Record, "id" | "date" | "createdAt" | "updatedAt">;

export type Create = Omit<Record, "id" | "materializedYUpdate" | "lastEventLocalSeq"> & {
  readonly id?: string;
  readonly materializedYUpdate?: MaterializedYUpdate;
  readonly lastEventLocalSeq?: Record["lastEventLocalSeq"];
};

export type Update = Partial<Omit<Record, "id">>;

export * as NoteSchema from "./note.schema";
