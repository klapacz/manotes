import * as SessionAuth from "@manotes/shared/session/auth";
import { Effect, Layer, Types } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { HttpApiError } from "effect/unstable/httpapi";
import { AuthService } from "./auth";

const CurrentSessionProvider = Effect.gen(function* () {
  // Capture services in build scope.
  const auth = yield* AuthService;

  return Effect.fnUntraced(function* (
    httpEffect: Effect.Effect<
      HttpServerResponse.HttpServerResponse,
      Types.unhandled,
      SessionAuth.Current
    >,
  ) {
    const current = yield* auth.resolve().pipe(
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
      // Keep rich auth failures for logs, but convert them to the public typed
      // HttpApi unauthorized error at the HTTP boundary.
      Effect.catchTag("Auth.UnauthorizedError", () =>
        Effect.fail(new HttpApiError.Unauthorized({})),
      ),
      Effect.tapErrorTag("Auth.SessionStoreError", (error) =>
        Effect.logError("Session KV failure").pipe(
          Effect.annotateLogs({
            operation: error.operation,
            cause: error.cause instanceof Error ? error.cause.message : String(error.cause),
          }),
        ),
      ),
      Effect.catchTag("Auth.SessionStoreError", () =>
        Effect.fail(new HttpApiError.InternalServerError({})),
      ),
    );

    return yield* httpEffect.pipe(Effect.provideService(SessionAuth.Current, current));
  });
});

export const RouterMiddleware = HttpRouter.middleware<{
  provides: SessionAuth.Current;
}>()(CurrentSessionProvider);

export const HttpApiMiddlewareLayer = Layer.effect(SessionAuth.Middleware, CurrentSessionProvider);
