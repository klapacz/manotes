import * as Effect from "effect/Effect";

export const resolve = Effect.fn("AuthIdentityDev.resolve")(() =>
  Effect.succeed({ email: "dev@manotes.local" }),
);
