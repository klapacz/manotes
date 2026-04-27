import { Effect, Layer } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";
import * as SessionApi from "@manotes/shared/session/api";
import * as SessionAuth from "@manotes/shared/session/auth";
import * as Accounts from "../accounts/durable-object";
import { AuthService } from "../auth/auth";
import * as Worker from "../http/worker";

export const layer = HttpApiBuilder.layer(SessionApi.SessionApi).pipe(
  Layer.provideMerge(
    HttpApiBuilder.group(SessionApi.SessionApi, "session", (handlers) =>
      Effect.gen(function* () {
        const env = yield* Worker.Env;
        const auth = yield* AuthService;
        return handlers
          .handleRaw("getSession", () => getSessionValue())
          .handle("checkWaitlist", ({ payload }) => checkWaitlistValue(env, payload.email))
          .handle("requestOtp", ({ payload }) =>
            auth.requestOtp(payload.email).pipe(
              Effect.map(() => undefined),
              Effect.catchTag("Auth.OtpStoreError", () =>
                Effect.fail(new HttpApiError.InternalServerError({})),
              ),
              Effect.catchTag("Auth.EmailSendError", () =>
                Effect.fail(new HttpApiError.InternalServerError({})),
              ),
              Effect.catch(() => Effect.fail(new HttpApiError.InternalServerError({}))),
            ),
          )
          .handle("verifyOtp", ({ payload }) =>
            auth.login(payload.email, payload.otp).pipe(
              Effect.catchTag("Auth.OtpVerificationError", () =>
                Effect.fail(new HttpApiError.Unauthorized({})),
              ),
              Effect.catchTag("Auth.OtpStoreError", () =>
                Effect.fail(new HttpApiError.InternalServerError({})),
              ),
              Effect.catchTag("Auth.AccountResolutionError", () =>
                Effect.fail(new HttpApiError.InternalServerError({})),
              ),
              Effect.catchTag("Auth.SessionStoreError", () =>
                Effect.fail(new HttpApiError.InternalServerError({})),
              ),
              Effect.catch(() => Effect.fail(new HttpApiError.InternalServerError({}))),
            ),
          )
          .handle("logout", () =>
            auth.logout().pipe(
              Effect.catchTag("Auth.SessionStoreError", () =>
                Effect.fail(new HttpApiError.InternalServerError({})),
              ),
              Effect.catch(() => Effect.fail(new HttpApiError.InternalServerError({}))),
            ),
          );
      }),
    ),
  ),
);

const getSessionValue = Effect.fn("SessionRoutes.getSessionValue")(function* () {
  const session = yield* SessionAuth.Current;

  return {
    accountId: session.accountId,
    email: session.email,
  };
});

const checkWaitlistValue = Effect.fn("SessionRoutes.checkWaitlistValue")(function* (
  env: globalThis.Env,
  email: string,
) {
  const accounts = env.ACCOUNTS_DO.getByName(Accounts.NAMESPACE_KEY);
  const result = yield* Effect.promise(() => accounts.checkOrWaitlist(email));
  return { status: result.status };
});
