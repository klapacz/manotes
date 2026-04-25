import * as SessionAuth from "@manotes/shared/session/auth";
import { Effect, Layer, Types } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { HttpApiError } from "effect/unstable/httpapi";
import * as Accounts from "../accounts/durable-object";
import * as Worker from "../http/worker";
import * as Errors from "./errors";
import * as IdentityResolver from "./identity/resolver";

const CurrentSessionProvider = Effect.gen(function* () {
  // capture services in build scope
  const env = yield* Worker.Env;
  const identityResolver = yield* IdentityResolver.Service;

  return Effect.fnUntraced(function* (
    httpEffect: Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      Types.unhandled,
      SessionAuth.Current
    >,
  ) {
    const current = yield* resolve().pipe(
      Effect.provideService(Worker.Env, env),
      Effect.provideService(IdentityResolver.Service, identityResolver),
      // Keep rich auth failures for logs, but convert them to the public typed
      // HttpApi unauthorized error at the HTTP boundary.
      Effect.tapErrorTag("Auth.UnauthorizedError", (error) => {
        const cause =
          error.cause instanceof Error
            ? (error.cause.stack ?? error.cause.message)
            : String(error.cause);

        return Effect.logWarning("Unauthorized request").pipe(
          Effect.annotateLogs({
            reason: error.reason,
            cause,
          }),
        );
      }),
      Effect.catchTag("Auth.UnauthorizedError", () =>
        Effect.fail(new HttpApiError.Unauthorized({})),
      ),
    );

    return yield* httpEffect.pipe(Effect.provideService(SessionAuth.Current, current));
  });
});

export const RouterMiddleware = HttpRouter.middleware<{
  provides: SessionAuth.Current;
}>()(CurrentSessionProvider);

export const HttpApiMiddlewareLayer = Layer.effect(SessionAuth.Middleware, CurrentSessionProvider);

const resolve = Effect.fn("AuthSession.resolve")(function* () {
  const env = yield* Worker.Env;
  const { email } = yield* IdentityResolver.Service.use((service) => service.resolve());

  const accounts = env.ACCOUNTS_DO.getByName(Accounts.NAMESPACE_KEY);

  return yield* Effect.tryPromise({
    try: () => accounts.ensureAccount(email),
    catch: (cause) => new Errors.UnauthorizedError({ reason: "Failed to resolve account", cause }),
  });
});
