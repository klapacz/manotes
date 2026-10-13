import { Schema } from "effect";
import { expect, it } from "vite-plus/test";
import * as Msgpack from "./msgpack";

// Captured with effect@4.0.0-rc.112's Msgpack.schema, before the stable Effect upgrade.
it("retains MessagePack bytes for stored dates and binary sync payloads", () => {
  const date = Msgpack.schema(Schema.Struct({ date: Schema.String }));
  const event = Msgpack.schema(Schema.Struct({ id: Schema.String, payload: Schema.Uint8Array }));

  for (const [codec, value, hex] of [
    [date, { date: "2026-10-13" }, "de0001a464617465aa323032362d31302d3133"],
    [
      event,
      { id: "event", payload: new Uint8Array([0, 255, 42]) },
      "de0002a26964a56576656e74a77061796c6f6164c40300ff2a",
    ],
  ] as const) {
    const bytes = Uint8Array.from(hex.match(/../g) ?? [], (byte) => Number.parseInt(byte, 16));
    expect(Schema.decodeUnknownSync(codec)(bytes)).toEqual(value);
    expect(Array.from(Schema.encodeUnknownSync(codec)(value))).toEqual(Array.from(bytes));
  }

  expect(() => Schema.decodeSync(date)(new Uint8Array([0xc1]))).toThrow();
});
