import { Data } from "effect";

export class LocalGraphNotFoundError extends Data.TaggedError(
  "GraphAccess.LocalGraphNotFoundError",
)<{
  localGraphId: string;
}> {}

export class LocalGraphAlreadySyncedError extends Data.TaggedError(
  "GraphAccess.LocalGraphAlreadySyncedError",
)<{
  localGraphId: string;
}> {}
