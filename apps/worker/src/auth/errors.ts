import { Data } from "effect";

export class UnauthorizedError extends Data.TaggedError("Auth.UnauthorizedError")<{
  reason: string;
  cause: unknown;
}> {}
