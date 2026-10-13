// Adapted from effect@4.0.0-rc.112/src/unstable/encoding/Msgpack.ts (MIT).
// Stable Effect removed Msgpack; retain the existing graph-sync and encrypted storage format.
// Keep only the schema codec, update imports, and copy output bytes to an ArrayBuffer-backed view.
import * as Msgpackr from "msgpackr";
import { Effect, Schema, SchemaIssue, SchemaTransformation } from "effect";

export const schema = <S extends Schema.Constraint>(schema: S) => {
  return Schema.Uint8Array.pipe(
    Schema.decodeTo(Schema.Unknown, transformation),
    Schema.decodeTo(schema),
  );
};

const transformation = SchemaTransformation.transformEffect<unknown, Uint8Array<ArrayBufferLike>>({
  decode(bytes, options) {
    try {
      return Effect.succeed(Msgpackr.decode(bytes));
    } catch {
      return Effect.fail(
        new SchemaIssue.InvalidValue({ expected: "valid MessagePack bytes" }, bytes, options),
      );
    }
  },
  encode(value, options) {
    try {
      return Effect.succeed(new Uint8Array(Msgpackr.encode(value)));
    } catch {
      return Effect.fail(
        new SchemaIssue.InvalidValue(
          { expected: "a MessagePack-serializable value" },
          value,
          options,
        ),
      );
    }
  },
});

export * as Msgpack from "./msgpack";
