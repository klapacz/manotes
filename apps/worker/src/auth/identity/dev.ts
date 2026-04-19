import { Effect } from "effect";

export const resolve = Effect.fn("AuthIdentityDev.resolve")(() =>
  Effect.succeed({ email: "dev@manotes.local" }),
);
