import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup } from "effect/unstable/httpapi";
import * as SessionAuth from "./auth";

export const Session = Schema.Struct({
  accountId: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
});

export type Session = typeof Session.Type;

export const WaitlistRequest = Schema.Struct({
  // TODO: validate this is actually an email
  email: Schema.String,
});

export const WaitlistStatus = Schema.Struct({
  status: Schema.Literals(["WAITLIST", "ACTIVE"]),
});

export const SessionApi = HttpApi.make("SessionApi").add(
  // Keep this group non-top-level so AtomHttpApi can access it as
  // client.session.getSession(...). AtomHttpApi currently doesn't support
  // HttpApiClient's flattened shape for topLevel groups.
  HttpApiGroup.make("session")
    .add(
      HttpApiEndpoint.get("getSession", "/api/session", {
        success: Session,
        // Intentional duplicate of SessionAuth.Middleware's error:
        // runtime merges middleware errors, but AtomHttpApi.query currently types
        // AsyncResult errors from endpoint-local _Error["Type"] only.
        error: SessionAuth.UnauthorizedError,
      }).middleware(SessionAuth.Middleware),
    )
    .add(
      HttpApiEndpoint.post("checkWaitlist", "/api/waitlist", {
        payload: WaitlistRequest,
        success: WaitlistStatus,
      }),
    ),
);
