import { Context } from "effect";
import { HttpApiError } from "effect/unstable/httpapi";

export interface CurrentSession {
  readonly accountId: string;
  readonly email: string;
}

export class Current extends Context.Service<Current, CurrentSession>()("Shared.Session.Current") {}

// Public API error for missing/invalid session.
//
// Keep this as the no-content variant because the worker intentionally returns
// an empty 401 response for signed-out requests. Using HttpApiError.Unauthorized
// would describe a typed error body instead.
export const UnauthorizedError = HttpApiError.UnauthorizedNoContent;

export const InternalServerError = HttpApiError.InternalServerErrorNoContent;

// Separate response schemas preserve each error's HTTP status and empty body.
export const AuthMiddlewareError = [UnauthorizedError, InternalServerError] as const;
