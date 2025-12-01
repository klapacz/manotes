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

export const Record = Schema.Struct({
  id: Schema.String,
  title: Schema.String,
  content: Content,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
});

export const Create = Schema.Struct({
  id: Schema.optional(Schema.String),
  title: Schema.String,
  content: Content,
  createdAt: Schema.DateTimeUtc,
  updatedAt: Schema.DateTimeUtc,
});

export const Update = Schema.Struct({
  title: Schema.optional(Schema.String),
  content: Schema.optional(Content),
  createdAt: Schema.optional(Schema.DateTimeUtc),
  updatedAt: Schema.optional(Schema.DateTimeUtc),
});
