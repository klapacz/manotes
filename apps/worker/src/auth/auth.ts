import { Context, Effect, Layer, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import * as Accounts from "../accounts/durable-object.ts";
import { EmailService } from "./email.ts";
import * as Errors from "./errors.ts";
import { OtpService } from "./otp.ts";
import { SessionKvService } from "./session-kv.ts";
import AccountsDurableObject from "../accounts/durable-object.ts";

const SessionCookie = Schema.Struct({ session: Schema.NonEmptyString });

const AuthorizationHeader = Schema.Struct({ authorization: Schema.NonEmptyString });

const readSessionCookie = HttpServerRequest.schemaCookies(SessionCookie).pipe(
  Effect.map((_) => _.session),
);

const readBearerToken = HttpServerRequest.schemaHeaders(AuthorizationHeader).pipe(
  Effect.flatMap(({ authorization }) => {
    const match = /^Bearer\s+(.+)$/i.exec(authorization);

    return match?.[1] ? Effect.succeed(match[1]) : Effect.fail("Missing bearer token");
  }),
);

const readSessionToken = readSessionCookie.pipe(Effect.catch(() => readBearerToken));

export class AuthService extends Context.Service<AuthService>()("Auth.AuthService", {
  make: Effect.gen(function* () {
    const session = yield* SessionKvService;
    const otp = yield* OtpService;
    const emailService = yield* EmailService;
    const accountsNS = yield* AccountsDurableObject;

    const requestOtp = Effect.fn("Auth.requestOtp")(function* (email: string) {
      const code = yield* otp.create(email);

      // NOTE: If sending fails, the OTP remains valid until its KV TTL expires.
      yield* emailService.send({
        to: email,
        subject: "Your Manotes sign-in code",
        text: [
          `Your Manotes sign-in code is: ${code}`,
          "",
          "This code expires in 10 minutes.",
          "",
          "If you didn’t request this code, you can safely ignore this email.",
        ].join("\n"),
      });
    });

    const login = Effect.fn("Auth.login")(function* (email: string, code: string) {
      yield* otp.verify(email, code);

      const accounts = accountsNS.getByName(Accounts.NAMESPACE_KEY);

      const { accountId } = yield* accounts
        .ensureAccount(email)
        .pipe(
          Effect.mapError(
            (cause) => new Errors.AccountResolutionError({ operation: "ensure", cause }),
          ),
        );

      const token = yield* session.create(email, accountId);

      return yield* HttpServerResponse.setCookie(
        HttpServerResponse.empty({ status: 200 }),
        "session",
        token,
        {
          httpOnly: true,
          secure: true,
          sameSite: "lax",
          path: "/",
          maxAge: session.SESSION_TTL,
        },
      );
    });

    const logout = Effect.fn("Auth.logout")(function* () {
      const token = yield* readSessionCookie.pipe(Effect.orElseSucceed(() => ""));

      if (token) yield* session.destroy(token);

      return yield* HttpServerResponse.expireCookie(
        HttpServerResponse.empty({ status: 204 }),
        "session",
        { path: "/" },
      );
    });

    const resolve = Effect.fn("Auth.resolve")(function* () {
      const token = yield* readSessionToken.pipe(
        Effect.mapError(
          (cause) => new Errors.UnauthorizedError({ reason: "Missing session token", cause }),
        ),
      );

      return yield* session.resolve(token).pipe(
        Effect.catchTag("Auth.SessionNotFoundError", (cause) =>
          Effect.fail(new Errors.UnauthorizedError({ reason: "Invalid session", cause })),
        ),
        Effect.catchTag("SchemaError", (cause) =>
          Effect.fail(new Errors.UnauthorizedError({ reason: "Invalid session payload", cause })),
        ),
      );
    });

    return { requestOtp, login, logout, resolve };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
