import { Effect } from "effect";
import * as AuthErrors from "../errors";

const email = import.meta.env.VITE_DEV_AUTH_EMAIL;

export const resolve = Effect.fn("AuthIdentityDev.resolve")(function* () {
  if (!email) {
    return yield* Effect.fail(
      new AuthErrors.UnauthorizedError({
        reason: "Dev auth email not configured",
        cause: new Error("VITE_DEV_AUTH_EMAIL is not set"),
      }),
    );
  }

  return { email };
});
