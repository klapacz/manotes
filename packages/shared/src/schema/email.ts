import { Schema } from "effect";

export const isEmail = Schema.isPattern(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, {
  message: "Must be a valid email address",
});

export const Email = Schema.Trim.pipe(Schema.check(isEmail));
