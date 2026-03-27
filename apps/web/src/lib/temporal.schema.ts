import { Temporal } from "temporal-polyfill";
import { Schema } from "effect";

const isValidPlainDateString = (s: string): boolean => {
  try {
    Temporal.PlainDate.from(s, { overflow: "reject" });
    return true;
  } catch {
    return false;
  }
};

export const PlainDateString = Schema.String.pipe(
  Schema.filter(isValidPlainDateString, {
    message: () => "Expected a valid ISO date string (YYYY-MM-DD)",
  }),
);
