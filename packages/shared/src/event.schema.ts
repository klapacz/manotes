import { Schema } from "effect";
import { Msgpack } from "./msgpack";
import * as TemporalSchema from "./temporal.schema";
import type { Tables } from "./db.tables";

export const Type = Schema.Literals(["update", "date"]);

export const DatePayload = Schema.Struct({
  date: TemporalSchema.PlainDateString,
});

const DatePayloadBytes = Msgpack.schema(DatePayload);

export const encodeDatePayload = Schema.encodeEffect(DatePayloadBytes);

export const decodeDatePayload = Schema.decodeEffect(DatePayloadBytes);

export type Record = Tables.Event;

export type Create = Omit<Tables.Event, "localSeq" | "id" | "commitSeq"> & {
  readonly id?: Tables.Event["id"];
  readonly commitSeq?: NonNullable<Tables.Event["commitSeq"]>;
};

export * as EventSchema from "./event.schema";
