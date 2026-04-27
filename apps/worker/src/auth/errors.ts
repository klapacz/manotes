import { Data } from "effect";

export class UnauthorizedError extends Data.TaggedError("Auth.UnauthorizedError")<{
  reason: string;
  cause: unknown;
}> {}

export class AccountResolutionError extends Data.TaggedError("Auth.AccountResolutionError")<{
  readonly operation: "ensure";
  readonly cause: unknown;
}> {}

export class EmailSendError extends Data.TaggedError("Auth.EmailSendError")<{
  readonly cause: unknown;
}> {}
