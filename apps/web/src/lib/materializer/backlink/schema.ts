import { Schema } from "effect";
import * as NoteSchema from "../../note.schema";

export const IncomingBacklinkNote = NoteSchema.Record.pipe(
  Schema.pick("id", "title", "content", "isDaily", "updatedAt"),
);
export type IncomingBacklinkNote = typeof IncomingBacklinkNote.Type;

export const decodeIncomingBacklinks = Schema.decode(Schema.Array(IncomingBacklinkNote));
