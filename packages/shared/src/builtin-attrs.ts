import { NoteSchema } from "./note.schema";

export const archivedId = NoteSchema.Id.make("builtin:archived");

export * as BuiltinAttrs from "./builtin-attrs";
