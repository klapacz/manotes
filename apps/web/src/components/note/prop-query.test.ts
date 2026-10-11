import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { Effect, Option, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { PropQuery } from "./prop-query";

it("formats unset, valid, and invalid property states without raw JSON", () => {
  const value = AttrsSchema.PropVal.cases.number.make({ val: 1234 });

  expect(PropQuery.stateLabel(Attrs.ValueState.Unset())).toBe("Choose");
  expect(PropQuery.stateLabel(Attrs.ValueState.Invalid<never, AttrsSchema.PropVal>({}))).toBe(
    "Invalid",
  );

  const valid = PropQuery.valueState({ type: "number", value: Option.some(value) });
  expect(valid).toEqual(Attrs.ValueState.Valid({ value }));
  expect(PropQuery.stateLabel(valid)).toBe("1234");

  const invalid = PropQuery.valueState({ type: "bool", value: Option.some(value) });
  expect(invalid).toEqual(Attrs.ValueState.Invalid({ value }));
  expect(PropQuery.stateLabel(invalid)).toBe("Invalid: 1234");

  const bool = AttrsSchema.PropVal.cases.bool.make({ val: false });
  expect(PropQuery.stateLabel(Attrs.ValueState.Valid({ value: bool }))).toBe("False");
  expect(PropQuery.valueState({ type: "bool", value: Option.none() })).toEqual(
    Attrs.ValueState.Unset(),
  );
});

describe("number property choices", () => {
  it.each(["0", "-7.5", " 1.25 ", "1e3"])("accepts finite numeric input %s", async (text) => {
    const matches = Option.getOrThrow(
      await Effect.runPromise(
        PropQuery.numberQuery({ defaultValue: Option.none() })({ text }).pipe(
          Stream.runHead,
          Effect.scoped,
        ),
      ),
    );

    expect(matches).toHaveLength(1);
    expect(matches[0]?.value.propVal).toEqual(
      AttrsSchema.PropVal.cases.number.make({ val: Number(text) }),
    );
  });

  it.each(["", "  ", "seven", "7 hours", "NaN", "Infinity", "1e999"])(
    "rejects %s",
    async (text) => {
      expect(Option.isNone(PropQuery.parseNumber(text))).toBe(true);

      const matches = Option.getOrThrow(
        await Effect.runPromise(
          PropQuery.numberQuery({ defaultValue: Option.none() })({ text }).pipe(
            Stream.runHead,
            Effect.scoped,
          ),
        ),
      );

      expect(matches).toEqual([]);
    },
  );

  it("offers a zero default without input", async () => {
    const matches = Option.getOrThrow(
      await Effect.runPromise(
        PropQuery.numberQuery({
          defaultValue: Option.some(AttrsSchema.PropVal.cases.number.make({ val: 0 })),
        })({ text: "" }).pipe(Stream.runHead, Effect.scoped),
      ),
    );

    expect(matches[0]?.value.propVal).toEqual(AttrsSchema.PropVal.cases.number.make({ val: 0 }));
    expect(matches[0]?.value.detail?.()).toBe("Default");
  });

  it("does not offer the default for invalid input", async () => {
    const matches = Option.getOrThrow(
      await Effect.runPromise(
        PropQuery.numberQuery({
          defaultValue: Option.some(AttrsSchema.PropVal.cases.number.make({ val: 7 })),
        })({ text: "seven" }).pipe(Stream.runHead, Effect.scoped),
      ),
    );

    expect(matches).toEqual([]);
  });
});

it("uses boolean labels as choice identities and marks the matching default", async () => {
  const matches = Option.getOrThrow(
    await Effect.runPromise(
      PropQuery.boolQuery({
        defaultValue: Option.some(AttrsSchema.PropVal.cases.bool.make({ val: false })),
      })({ text: "" }).pipe(Stream.runHead, Effect.scoped),
    ),
  );

  expect(
    matches.map(({ value }) => ({
      id: value.value,
      label: value.label,
      detail: value.detail?.(),
    })),
  ).toEqual([
    { id: "True", label: "True", detail: undefined },
    { id: "False", label: "False", detail: "Default" },
  ]);
});
