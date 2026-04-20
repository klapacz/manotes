import { Effect } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import * as Jose from "jose";
import * as AuthErrors from "./errors";
import { Schema } from "effect";
import * as Worker from "../http/worker";

// Read from the domain-wide cookie set by Cloudflare Access after login,
// rather than the per-request header injection which only works on "Allow" routes.
// The CF_Authorization cookie is a signed JWT with the same payload as
// the cf-access-jwt-assertion header (email, iss, aud, exp).

export const readAccessToken = Effect.fn("AuthJwt.readAccessToken")(function* () {
  const cookies = yield* HttpServerRequest.schemaCookies(
    Schema.Struct({
      CF_Authorization: Schema.NonEmptyString,
    }),
  ).pipe(
    Effect.mapError(
      (cause) => new AuthErrors.UnauthorizedError({ reason: "Missing Access token cookie", cause }),
    ),
  );

  return cookies["CF_Authorization"];
});

export const JwtPayload = Schema.Struct({
  email: Schema.NonEmptyString,
  iss: Schema.NonEmptyString,
  aud: Schema.Union([Schema.NonEmptyString, Schema.Array(Schema.NonEmptyString)]),
  exp: Schema.Number,
  nbf: Schema.optional(Schema.Number),
});
export const decodeJwtPayload = Schema.decodeUnknownEffect(JwtPayload);

export const verifyAccessJwt = Effect.fn("AuthJwt.verifyAccessJwt")(function* (token: string) {
  const env = yield* Worker.Env;
  const expectedIssuer = normalizeOrigin(env.ACCESS_TEAM_DOMAIN);

  const verifiedPayload = yield* Effect.tryPromise({
    try: async () => {
      const { payload } = await Jose.jwtVerify(token, getRemoteJwkSet(expectedIssuer), {
        issuer: [expectedIssuer, `${expectedIssuer}/`],
        audience: env.ACCESS_AUD,
        algorithms: ["RS256"],
      });

      return payload;
    },
    catch: (cause) => new AuthErrors.UnauthorizedError({ reason: "Invalid Access token", cause }),
  });

  return yield* decodeJwtPayload(verifiedPayload).pipe(
    Effect.mapError(
      (cause) => new AuthErrors.UnauthorizedError({ reason: "Malformed JWT payload", cause }),
    ),
  );
});

function normalizeOrigin(teamDomain: string) {
  const url = teamDomain.includes("://") ? new URL(teamDomain) : new URL(`https://${teamDomain}`);
  return url.origin.replace(/\/$/, "");
}

let remoteJwkSet: ReturnType<typeof Jose.createRemoteJWKSet> | undefined;

function getRemoteJwkSet(teamDomain: string) {
  return (remoteJwkSet ??= Jose.createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`)));
}
