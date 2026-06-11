import { Schema, SchemaGetter } from "effect";
import type { UnknownNodeJSON } from "./node-json";

const ContentValue = Schema.declare<UnknownNodeJSON>((_x): _x is UnknownNodeJSON => true);

export const Content = Schema.String.pipe(
  Schema.decodeTo(ContentValue, {
    decode: SchemaGetter.transform((value: string) => JSON.parse(value) as UnknownNodeJSON),
    encode: SchemaGetter.transform((value: UnknownNodeJSON) => JSON.stringify(value)),
  }),
);

export const MaterializedYUpdate = Schema.Union([Schema.Null, Schema.Uint8Array]);

export const Record = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  content: Content,
  materializedYUpdate: MaterializedYUpdate,
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
  lastEventLocalSeq: Schema.Number,
});

export const Preview = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  updatedAt: Schema.DateTimeUtcFromString,
});

export const Create = Schema.Struct({
  id: Schema.optional(Schema.String),
  title: Schema.String,
  content: Content,
  materializedYUpdate: Schema.optional(MaterializedYUpdate),
  createdAt: Schema.DateTimeUtcFromString,
  updatedAt: Schema.DateTimeUtcFromString,
  lastEventLocalSeq: Schema.optional(Schema.Number),
});

export const Update = Schema.Struct({
  title: Schema.optional(Schema.String),
  content: Schema.optional(Content),
  materializedYUpdate: Schema.optional(MaterializedYUpdate),
  createdAt: Schema.optional(Schema.DateTimeUtcFromString),
  updatedAt: Schema.optional(Schema.DateTimeUtcFromString),
  lastEventLocalSeq: Schema.optional(Schema.Number),
});
