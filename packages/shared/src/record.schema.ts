import { Schema } from "effect";
import type { UnknownNodeJSON } from "./node-json";

export const Id = Schema.NonEmptyString.pipe(Schema.brand("RecordId"));

export type Id = typeof Id.Type;

export const CreateId = Id.pipe(
  Schema.check(
    Schema.makeFilter((id) => {
      return id.startsWith("builtin:") ? "Record IDs cannot start with builtin:" : undefined;
    }),
  ),
);

// eslint-disable-next-line manotes/no-type-predicates -- This opaque ProseMirror schema preserves the editor-owned JSON contract; it deliberately performs no validation.
export const Content = Schema.declare<UnknownNodeJSON>((_x): _x is UnknownNodeJSON => true);

export * as RecordSchema from "./record.schema";
