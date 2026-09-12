import * as SessionAuth from "@manotes/shared/session/auth";
import { Effect } from "effect";
import { HttpServerResponse } from "effect/unstable/http";
import { AuthService } from "./auth.ts";

// Effect rc.112's HttpApi middleware captures required services during router setup.
// Wrap handlers instead so Alchemy's RuntimeContext comes from the current request.
export const RouterMiddleware = Effect.gen(function* () {
  const auth = yield* AuthService;

  return Effect.fnUntraced(function* <A, E, R>(
    httpEffect: Effect.Effect<A, E, R | SessionAuth.Current>,
  ) {
    return yield* resolveCurrentSession(auth).pipe(
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
});

const resolveCurrentSession = Effect.fn("AuthSession.resolveCurrentSession")(function* (
  auth: Effect.Success<typeof AuthService>,
) {
  return yield* auth.resolve().pipe(
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
