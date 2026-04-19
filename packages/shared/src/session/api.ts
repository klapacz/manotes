import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";

export const Session = Schema.Struct({
  accountId: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
});

export type Session = typeof Session.Type;

export const SessionApi = HttpApi.make("SessionApi").add(
  HttpApiGroup.make("session", { topLevel: true }).add(
    HttpApiEndpoint.get("getSession", "/api/session", {
      success: Session,
    }),
  ),
);
