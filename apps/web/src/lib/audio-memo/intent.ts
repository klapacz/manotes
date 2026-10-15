import { Schema } from "effect";
import { RecordSchema } from "@manotes/shared/record.schema";
import * as TemporalSchema from "@manotes/shared/temporal.schema";

export const Record = Schema.Struct({
  date: TemporalSchema.PlainDateString,
  backlink: Schema.NullOr(RecordSchema.Id),
});

export type Record = typeof Record.Type;

const Json = Schema.fromJsonString(Record);

export const encode = Schema.encodeEffect(Json);

export const decode = Schema.decodeEffect(Json);

export * as AudioMemoIntent from "./intent";
