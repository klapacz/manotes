import { Effect, Context } from "effect";
import { HttpRouter } from "effect/unstable/http";
import { HttpApiError } from "effect/unstable/httpapi";
import type * as Accounts from "../accounts/durable-object";
import * as Errors from "./errors";
import * as Worker from "../http/worker";
import * as IdentityResolver from "./identity/resolver";

export class Current extends Context.Service<Current, Accounts.ResolvedAccount>()(
  "Worker.Session",
) {}

export const Middleware = HttpRouter.middleware<{
  provides: Current;
}>()(
  Effect.gen(function* () {
    // capture services in build scope
    const env = yield* Worker.Env;
    const identityResolver = yield* IdentityResolver.Service;

    return Effect.fnUntraced(function* (httpEffect) {
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

      return yield* httpEffect.pipe(Effect.provideService(Current, current));
    });
  }),
);

const ACCOUNTS_NAMESPACE_KEY = "accounts-v1";

const resolve = Effect.fn("AuthSession.resolve")(function* () {
  const env = yield* Worker.Env;
  const { email } = yield* IdentityResolver.Service.use((service) => service.resolve());

  const accounts = env.ACCOUNTS_DO.getByName(ACCOUNTS_NAMESPACE_KEY);

  return yield* Effect.tryPromise({
    try: () => accounts.ensureAccount(email),
    catch: (cause) => new Errors.UnauthorizedError({ reason: "Failed to resolve account", cause }),
  });
});
