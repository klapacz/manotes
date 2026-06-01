import * as Alchemy from "alchemy";
import * as SessionAuth from "@manotes/shared/session/auth";
import { Effect, Layer, Types } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import { HttpApiError } from "effect/unstable/httpapi";
import { AuthService } from "./auth.ts";

export const RouterMiddleware = HttpRouter.middleware<{
  provides: SessionAuth.Current;
}>()(
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const runtimeContext = yield* Alchemy.RuntimeContext;

    return Effect.fnUntraced(function* (
      httpEffect: Effect.Effect<
        HttpServerResponse.HttpServerResponse,
        Types.unhandled,
        SessionAuth.Current
      >,
    ) {
      return yield* resolveCurrentSession(auth, runtimeContext).pipe(
        Effect.flatMap((current) =>
          httpEffect.pipe(Effect.provideService(SessionAuth.Current, current)),
        ),
        Effect.catchTag("Auth.UnauthorizedError", () =>
          Effect.succeed(HttpServerResponse.empty({ status: 401 })),
        ),
        Effect.catchTag("Auth.SessionStoreError", () =>
          Effect.succeed(HttpServerResponse.empty({ status: 500 })),
        ),
      );
    });
  }),
);

export const HttpApiMiddlewareLayer = Layer.effect(
  SessionAuth.Middleware,
  Effect.gen(function* () {
    const auth = yield* AuthService;
    const runtimeContext = yield* Alchemy.RuntimeContext;

    return Effect.fnUntraced(function* (
      httpEffect: Effect.Effect<
        HttpServerResponse.HttpServerResponse,
        Types.unhandled,
        SessionAuth.Current
      >,
    ) {
      return yield* resolveCurrentSession(auth, runtimeContext).pipe(
        Effect.flatMap((current) =>
          httpEffect.pipe(Effect.provideService(SessionAuth.Current, current)),
        ),
        Effect.catchTag("Auth.UnauthorizedError", () =>
          Effect.fail(new HttpApiError.Unauthorized({})),
        ),
        Effect.catchTag("Auth.SessionStoreError", () =>
          Effect.fail(new HttpApiError.InternalServerError({})),
        ),
      );
    });
  }),
);

const resolveCurrentSession = Effect.fn("AuthSession.resolveCurrentSession")(function* (
  auth: Effect.Success<typeof AuthService>,
  runtimeContext: Alchemy.BaseRuntimeContext,
) {
  return yield* auth
    .resolve()
    .pipe(Effect.provide(Layer.succeed(Alchemy.RuntimeContext, runtimeContext)))
    .pipe(
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
      Effect.tapErrorTag("Auth.SessionStoreError", (error) =>
        Effect.logError("Session KV failure").pipe(
          Effect.annotateLogs({
            operation: error.operation,
            cause: error.cause instanceof Error ? error.cause.message : String(error.cause),
          }),
        ),
      ),
    );
});
