import { Context, Effect, Layer } from "effect";
import { HttpApiBuilder, HttpApiError } from "effect/unstable/httpapi";
import * as SessionApi from "@manotes/shared/session/api";
import * as SessionAuth from "@manotes/shared/session/auth";
import * as Accounts from "../accounts/durable-object.ts";
import { AuthService } from "../auth/auth.ts";
import AccountsDurableObject from "../accounts/durable-object.ts";

export const layer = HttpApiBuilder.layer(SessionApi.SessionApi).pipe(
  Layer.provideMerge(
    HttpApiBuilder.group(SessionApi.SessionApi, "session", (handlers) =>
      Effect.gen(function* () {
        const auth = yield* AuthService;
        const svc = yield* Service;
        return handlers
          .handleRaw("getSession", () => svc.getSessionValue())
          .handle("checkWaitlist", ({ payload }) => svc.checkWaitlistValue(payload.email))
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

export class Service extends Context.Service<Service>()("SessionRoutes.Service", {
  make: Effect.gen(function* () {
    const accountsNS = yield* AccountsDurableObject;

    const getSessionValue = Effect.fn("SessionRoutes.getSessionValue")(function* () {
      const session = yield* SessionAuth.Current;

      return {
        accountId: session.accountId,
        email: session.email,
      };
    });

    const checkWaitlistValue = Effect.fn("SessionRoutes.checkWaitlistValue")(function* (
      email: string,
    ) {
      const accounts = accountsNS.getByName(Accounts.NAMESPACE_KEY);
      const result = yield* accounts.checkOrWaitlist(email).pipe(Effect.orDie);
      return { status: result.status };
    });

    return { getSessionValue, checkWaitlistValue };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
