import * as Schema from "effect/Schema";
import * as HttpApi from "effect/unstable/httpapi/HttpApi";
import * as HttpApiEndpoint from "effect/unstable/httpapi/HttpApiEndpoint";
import * as HttpApiGroup from "effect/unstable/httpapi/HttpApiGroup";

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
