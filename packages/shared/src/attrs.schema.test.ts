import { Result, Schema } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { AttrsSchema } from "./attrs.schema";

describe("Attrs defaults", () => {
  it("decodes empty attrs and constructs a note with the same defaults", () => {
    const attrs = AttrsSchema.Attrs.members[0].make({});

    expect(attrs._tag).toBe("note");
    expect(attrs.props).toEqual({});
    expect(Schema.decodeUnknownSync(AttrsSchema.Attrs)({})).toEqual(attrs);
  });

  it.each([
    ["_tag", "broken"],
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

describe("Attrs property groups", () => {
  it("decodes scalar values and rule groups together", () => {
    const props = {
      [AttrsSchema.NoteId.make("prop_id:kind")]: AttrsSchema.PropVal.cases.enum.make({
        val: AttrsSchema.NoteId.make("option_id:task"),
      }),
      [AttrsSchema.NoteId.make("rule_id:task")]: AttrsSchema.PropGroup.make({
        props: {
          [AttrsSchema.NoteId.make("prop_id:priority")]: AttrsSchema.PropVal.cases.number.make({
            val: 3,
          }),
        },
      }),
    };

    expect(Schema.decodeUnknownSync(AttrsSchema.Attrs)({ props }).props).toEqual(props);
  });

  it.each([
    '{"_tag":"group"}',
    '{"_tag":"group","props":null}',
    '{"_tag":"group","props":{"priority":{"_tag":"number","val":"high"}}}',
    '{"_tag":"group","props":{"nested":{"_tag":"group","props":{}}}}',
  ])("rejects malformed or nested groups: %s", (json) => {
    const group = JSON.parse(json);

    expect(
      Result.isFailure(Schema.decodeUnknownResult(AttrsSchema.Props)({ "rule_id:task": group })),
    ).toBe(true);
  });
});
