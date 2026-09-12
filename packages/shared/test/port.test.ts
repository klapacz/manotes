import { Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { PortSchema } from "../src/schema/port";

describe("PortSchema", () => {
  it.each([
    ["1", 1],
    ["3000", 3000],
    ["5173", 5173],
    ["65535", 65_535],
    ["03000", 3000],
    ["+3000", 3000],
    ["3e3", 3000],
    ["0xbb8", 3000],
    [" 3000", 3000],
    ["3000 ", 3000],
    ["3000\n", 3000],
  ] as const)("decodes %s as %i", (input, expected) => {
    expect(PortSchema.decode(input)).toBe(expected);
    expect(Schema.encodeSync(PortSchema.FromString)(expected)).toBe(String(expected));
  });

  it.each([
    "",
    "  ",
    "0",
    "65536",
    "9999999999999999999999999",
    "-1",
    "3.5",
    "3000abc",
    "NaN",
    "Infinity",
  ])("rejects invalid port %j", (input) => {
    expect(() => PortSchema.decode(input)).toThrow();
  });

  it("allows an absent port", () => {
    expect(PortSchema.decode(undefined)).toBeUndefined();
  });

  it.each([0, -1, 65_536, 1.5, NaN, Infinity])("rejects invalid numeric port %s", (port) => {
    expect(Schema.is(PortSchema.Schema)(port)).toBe(false);
  });
});
