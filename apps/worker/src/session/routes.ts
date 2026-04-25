import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import * as SessionApi from "@manotes/shared/session/api";
import * as SessionAuth from "@manotes/shared/session/auth";
import * as Accounts from "../accounts/durable-object";
import * as Worker from "../http/worker";

export const layer = HttpApiBuilder.layer(SessionApi.SessionApi).pipe(
  Layer.provideMerge(
    HttpApiBuilder.group(SessionApi.SessionApi, "session", (handlers) =>
      Effect.gen(function* () {
        const env = yield* Worker.Env;
        return handlers
          .handleRaw("getSession", () => getSessionValue())
          .handle("checkWaitlist", ({ payload }) => checkWaitlistValue(env, payload.email));
      }),
    ),
  ),
);

const getSessionValue = Effect.fn("SessionRoutes.getSessionValue")(function* () {
  const session = yield* SessionAuth.Current;

  return {
    accountId: session.accountId,
    email: session.email,
  };
});

const checkWaitlistValue = Effect.fn("SessionRoutes.checkWaitlistValue")(function* (
  env: globalThis.Env,
  email: string,
) {
  const accounts = env.ACCOUNTS_DO.getByName(Accounts.NAMESPACE_KEY);
  const result = yield* Effect.promise(() => accounts.checkOrWaitlist(email));
  return { status: result.status };
});
