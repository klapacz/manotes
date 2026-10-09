import { Result, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { AttrsSchema } from "./attrs.schema";

describe("Attrs defaults", () => {
  it("decodes empty attrs and constructs a note with the same defaults", () => {
    const attrs = AttrsSchema.Attrs.members[0].make({});

    expect(attrs._tag).toBe("note");
    expect(attrs.builtin).toBe(false);
    expect(attrs.props).toEqual({});
    expect(Schema.decodeUnknownSync(AttrsSchema.Attrs)({})).toEqual(attrs);
  });

  it.each([
    ["_tag", "broken"],
    ["builtin", "false"],
    ["props", null],
  ])("does not default a malformed %s", (key, value) => {
    expect(Result.isFailure(Schema.decodeUnknownResult(AttrsSchema.Attrs)({ [key]: value }))).toBe(
      true,
    );
  });

  it("retains required fields for non-note records", () => {
    for (const tag of ["prop", "rule", "owned"]) {
      expect(Result.isFailure(Schema.decodeUnknownResult(AttrsSchema.Attrs)({ _tag: tag }))).toBe(
        true,
      );
    }
  });
});
