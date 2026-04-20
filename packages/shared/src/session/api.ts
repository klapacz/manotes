import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiError, HttpApiGroup } from "effect/unstable/httpapi";

export const Session = Schema.Struct({
  accountId: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
});

export type Session = typeof Session.Type;

export const SessionApi = HttpApi.make("SessionApi").add(
  // Keep this group non-top-level so AtomHttpApi can access it as
  // client.session.getSession(...). AtomHttpApi currently doesn't support
  // HttpApiClient's flattened shape for topLevel groups.
  HttpApiGroup.make("session").add(
    HttpApiEndpoint.get("getSession", "/api/session", {
      success: Session,
      // The worker returns an empty 401 response for signed-out requests, so this
      // must be the no-content variant. Using Unauthorized would expect a typed
      // error body, causing AtomHttpApi to see a raw HttpClientError and die.
      error: HttpApiError.UnauthorizedNoContent,
    }),
  ),
);
