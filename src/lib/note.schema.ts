import { Schema } from "effect";
import type { UnknownNodeJSON } from "./node-json";
import * as SchemaPrimitives from "./schema/primitives";

export const Content = Schema.transform(
  Schema.String,
  Schema.declare<UnknownNodeJSON>((_x): _x is UnknownNodeJSON => true),
  {
    encode: (value) => JSON.stringify(value),
    decode: (value) => JSON.parse(value),
  },
);

export const MaterializedYUpdate = Schema.Union(
  Schema.Null,
  Schema.instanceOf(Uint8Array<ArrayBufferLike>),
);

export const Record = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  content: Content,
  isDaily: SchemaPrimitives.BooleanFromInt,
  materializedYUpdate: MaterializedYUpdate,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  lastEventLocalSeq: Schema.Number,
});

export const Preview = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  isDaily: SchemaPrimitives.BooleanFromInt,
  updatedAt: Schema.DateTimeUtc,
});

export const Create = Schema.Struct({
  id: Schema.optional(Schema.String),
  title: Schema.String,
  content: Content,
  isDaily: Schema.optional(SchemaPrimitives.BooleanFromInt),
  materializedYUpdate: Schema.optional(MaterializedYUpdate),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  lastEventLocalSeq: Schema.optional(Schema.Number),
});

export const Update = Schema.Struct({
  title: Schema.optional(Schema.String),
  content: Schema.optional(Content),
  isDaily: Schema.optional(SchemaPrimitives.BooleanFromInt),
  materializedYUpdate: Schema.optional(MaterializedYUpdate),
  createdAt: Schema.optional(Schema.DateTimeUtc),
  updatedAt: Schema.optional(Schema.DateTimeUtc),
  lastEventLocalSeq: Schema.optional(Schema.Number),
});
