import { Schema } from "effect";
import { NoteSchema } from "../note.schema";
import * as TemporalSchema from "../temporal.schema";

export const Record = Schema.Struct({
  date: TemporalSchema.PlainDateString,
  backlink: Schema.NullOr(NoteSchema.Id),
});

export type Record = typeof Record.Type;

const Json = Schema.fromJsonString(Record);

export const encode = Schema.encodeEffect(Json);

export const decode = Schema.decodeEffect(Json);

export * as AudioMemoIntent from "./intent";
