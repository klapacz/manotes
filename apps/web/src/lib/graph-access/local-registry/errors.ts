import { Data, Predicate } from "effect";
import type { SqlError } from "effect/unstable/sql";
import type { SqlErrorReason } from "effect/unstable/sql/SqlError";

export class DisplayNameTakenError extends Data.TaggedError("LocalRegistry.DisplayNameTakenError")<{
  displayName: string;
}> {}

export function remapDisplayNameSqlError(error: SqlError.SqlError, displayName: string) {
  if (isDisplayNameUniquenessSqlError(error.cause)) {
    return new DisplayNameTakenError({ displayName });
  }

  return error;
}

export function isDisplayNameUniquenessSqlError(reason: SqlErrorReason): boolean {
  return (
    Predicate.isTagged(reason, "UnknownError") &&
    Predicate.isString(reason.cause) &&
    reason.cause.includes("UNIQUE constraint failed") &&
    reason.cause.includes("graphs.displayName")
  );
}

export function isGraphIdUniquenessSqlError(reason: SqlErrorReason): boolean {
  return (
    Predicate.isTagged(reason, "UnknownError") &&
    Predicate.isString(reason.cause) &&
    reason.cause.includes("UNIQUE constraint failed") &&
    reason.cause.includes("graphs.graphId")
  );
}
