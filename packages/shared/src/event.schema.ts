import { Schema } from "effect";
import { Msgpack } from "./msgpack";
import { TemporalSchema } from "./temporal.schema";

export const Type = Schema.Literals(["update", "date"]);

export const DatePayload = Schema.Struct({
  date: TemporalSchema.PlainDateString,
});

const DatePayloadBytes = Msgpack.schema(DatePayload);

export const encodeDatePayload = Schema.encodeEffect(DatePayloadBytes);

export const decodeDatePayload = Schema.decodeEffect(DatePayloadBytes);

export * as EventSchema from "./event.schema";
