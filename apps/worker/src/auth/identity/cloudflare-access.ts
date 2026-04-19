import { Effect } from "effect";
import * as AuthJwt from "../jwt";

export const resolve = Effect.fn("AuthIdentityCloudflareAccess.resolve")(function* () {
  const token = yield* AuthJwt.readAccessToken();
  const { email } = yield* AuthJwt.verifyAccessJwt(token);

  return { email };
});
