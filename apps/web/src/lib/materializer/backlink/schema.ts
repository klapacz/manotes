import { Schema, Struct } from "effect";
import * as NoteSchema from "../../note.schema";

export const IncomingBacklinkNote = NoteSchema.Record.mapFields(
  Struct.pick(["id", "title", "content", "isDaily", "updatedAt"]),
);
export type IncomingBacklinkNote = typeof IncomingBacklinkNote.Type;

export const decodeIncomingBacklinks = Schema.decodeEffect(Schema.Array(IncomingBacklinkNote));
