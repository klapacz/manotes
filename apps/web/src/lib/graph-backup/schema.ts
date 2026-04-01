import { Schema } from "effect";
import * as EventSchema from "../event.schema";

export const Record = Schema.Struct({
  noteId: Schema.NonEmptyString,
  type: EventSchema.Type,
  payload: Schema.Uint8ArrayFromBase64,
  createdAt: Schema.DateTimeUtcFromString,
  id: Schema.NonEmptyString,
});
export type Record = typeof Record.Type;

export const Bundle = Schema.Struct({
  version: Schema.Literal(1),
  exportedAt: Schema.DateTimeUtcFromString,
  sourceGraphDisplayName: Schema.String,
  events: Schema.Array(Record),
});
export type Bundle = typeof Bundle.Type;

export const File = Schema.fromJsonString(Bundle);
export type File = typeof File.Type;

export const encodeBundle = Schema.encodeEffect(Bundle);
export const decodeBundle = Schema.decodeUnknownEffect(Bundle);
export const encodeFile = Schema.encodeEffect(File);
export const decodeFile = Schema.decodeUnknownEffect(File);
