import { Schema } from "effect";
import type { NodeJSON } from "prosekit/core";

export const Content = Schema.transform(
  Schema.String,
  Schema.declare<NodeJSON>((_x): _x is NodeJSON => true),
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
  materializedYUpdate: MaterializedYUpdate,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  lastEventId: Schema.Number,
});

export const Create = Schema.Struct({
  id: Schema.optional(Schema.String),
  title: Schema.String,
  content: Content,
  materializedYUpdate: Schema.optional(MaterializedYUpdate),
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
  lastEventId: Schema.optional(Schema.Number),
});

export const Update = Schema.Struct({
  title: Schema.optional(Schema.String),
  content: Schema.optional(Content),
  materializedYUpdate: Schema.optional(MaterializedYUpdate),
  createdAt: Schema.optional(Schema.DateTimeUtc),
  updatedAt: Schema.optional(Schema.DateTimeUtc),
  lastEventId: Schema.optional(Schema.Number),
});
