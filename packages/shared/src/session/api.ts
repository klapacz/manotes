import { Schema } from "effect";
import { HttpApi, HttpApiEndpoint, HttpApiGroup, HttpApiError } from "effect/unstable/httpapi";
import * as EmailSchema from "../schema/email";
import * as SessionAuth from "./auth";

export const Session = Schema.Struct({
  accountId: Schema.NonEmptyString,
  email: Schema.NonEmptyString,
});

export type Session = typeof Session.Type;

export const ApiKey = Schema.Struct({
  apiKey: Schema.NonEmptyString,
});

export type ApiKey = typeof ApiKey.Type;

export const WaitlistRequest = Schema.Struct({
  email: EmailSchema.Email,
});

export const WaitlistStatus = Schema.Struct({
  status: Schema.Literals(["WAITLIST", "ACTIVE"]),
});

export const OtpRequest = Schema.Struct({
  email: EmailSchema.Email,
});

export const OtpVerify = Schema.Struct({
  email: EmailSchema.Email,
  otp: Schema.String.pipe(Schema.check(Schema.isMinLength(6), Schema.isMaxLength(6))),
});

const AuthOtpRequestError = HttpApiError.InternalServerErrorNoContent;
const AuthOtpVerifyError = Schema.Union([
  HttpApiError.UnauthorizedNoContent,
  HttpApiError.InternalServerErrorNoContent,
]);
const LogoutError = HttpApiError.InternalServerErrorNoContent;

export const SessionApi = HttpApi.make("SessionApi").add(
  // Keep this group non-top-level so AtomHttpApi can access it as
  // client.session.getSession(...). AtomHttpApi currently doesn't support
  // HttpApiClient's flattened shape for topLevel groups.
  HttpApiGroup.make("session")
    .add(
      HttpApiEndpoint.get("getSession", "/api/session", {
        success: Session,
        // Intentional duplicate of SessionAuth.Middleware's error:
        // runtime merges middleware errors, but AtomHttpApi.query currently types
        // AsyncResult errors from endpoint-local _Error["Type"] only.
        error: SessionAuth.AuthMiddlewareError,
      }).middleware(SessionAuth.Middleware),
    )
    .add(
      HttpApiEndpoint.post("createApiKey", "/api/auth/api-key", {
        success: ApiKey,
        error: SessionAuth.AuthMiddlewareError,
      }).middleware(SessionAuth.Middleware),
    )
    .add(
      HttpApiEndpoint.post("checkWaitlist", "/api/waitlist", {
        payload: WaitlistRequest,
        success: WaitlistStatus,
      }),
    )
    .add(
      HttpApiEndpoint.post("requestOtp", "/api/auth/otp/request", {
        payload: OtpRequest,
        success: Schema.Void,
        error: AuthOtpRequestError,
      }),
    )
    .add(
      HttpApiEndpoint.post("verifyOtp", "/api/auth/otp/verify", {
        payload: OtpVerify,
        success: Schema.Void,
        error: AuthOtpVerifyError,
      }),
    )
    .add(
      HttpApiEndpoint.post("logout", "/api/auth/logout", {
        success: Schema.Void,
        error: LogoutError,
      }),
    ),
);
