import { Context, Effect, Layer, Schema } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import * as Accounts from "../accounts/durable-object";
import * as Worker from "../http/worker";
import { EmailService } from "./email";
import * as Errors from "./errors";
import { OtpService } from "./otp";
import { SessionKvService } from "./session-kv";

const SessionCookie = Schema.Struct({ session: Schema.NonEmptyString });

const readSessionCookie = HttpServerRequest.schemaCookies(SessionCookie).pipe(
  Effect.map((_) => _.session),
);

export class AuthService extends Context.Service<AuthService>()("Auth.AuthService", {
  make: Effect.gen(function* () {
    const session = yield* SessionKvService;
    const otp = yield* OtpService;
    const emailService = yield* EmailService;
    const env = yield* Worker.Env;

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

      const accounts = env.ACCOUNTS_DO.getByName(Accounts.NAMESPACE_KEY);
      const { accountId } = yield* Effect.tryPromise({
        try: () => accounts.ensureAccount(email),
        catch: (cause) => new Errors.AccountResolutionError({ operation: "ensure", cause }),
      });

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
      const token = yield* readSessionCookie.pipe(
        Effect.mapError(
          (cause) => new Errors.UnauthorizedError({ reason: "Missing session cookie", cause }),
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
