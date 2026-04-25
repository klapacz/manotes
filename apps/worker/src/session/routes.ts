import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import * as SessionApi from "@manotes/shared/session/api";
import * as SessionAuth from "@manotes/shared/session/auth";

export const layer = HttpApiBuilder.layer(SessionApi.SessionApi).pipe(
  Layer.provideMerge(
    HttpApiBuilder.group(SessionApi.SessionApi, "session", (handlers) =>
      handlers.handleRaw("getSession", () => getSessionValue()),
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
