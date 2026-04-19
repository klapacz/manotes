import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import * as SessionApi from "@manotes/shared/session/api";
import * as AuthSession from "../auth/session";

export const layer = HttpApiBuilder.layer(SessionApi.SessionApi).pipe(
  Layer.provideMerge(
    HttpApiBuilder.group(SessionApi.SessionApi, "session", (handlers) =>
      handlers.handleRaw("getSession", () => getSessionValue()),
    ),
  ),
);

const getSessionValue = Effect.fn("SessionRoutes.getSessionValue")(function* () {
  const session = yield* AuthSession.Current;

  return {
    accountId: session.accountId,
    email: session.email,
  };
});
