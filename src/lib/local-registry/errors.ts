import { Data } from "effect";
import type { SqlError } from "@effect/sql";

export class DisplayNameTakenError extends Data.TaggedError(
  "LocalRegistry.DisplayNameTakenError",
)<{
  displayName: string;
}> {}

export function remapDisplayNameSqlError(
  error: SqlError.SqlError,
  displayName: string,
) {
  if (isDisplayNameUniquenessSqlError(error.cause)) {
    return new DisplayNameTakenError({ displayName });
  }

  return error;
}

export function isDisplayNameUniquenessSqlError(error: unknown): boolean {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }

  return (
    message.includes("UNIQUE constraint failed") &&
    message.includes("graphs.displayName")
  );
}

export function isGraphIdUniquenessSqlError(error: unknown): boolean {
  let message: string;

  if (error instanceof Error) {
    message = error.message;
  } else {
    message = String(error);
  }

  return (
    message.includes("UNIQUE constraint failed") &&
    message.includes("graphs.graphId")
  );
}
