import { Data, Effect, Schema } from "effect";
import { SqlError } from "effect/unstable/sql";
import * as Migrator from "@manotes/shared/migrator";
import { migrations } from "../../drizzle/migrations";

class Error extends Data.TaggedError("Migrator.Error")<{
  cause: SqlError.SqlError | Schema.SchemaError;
}> {}

export const migrate = Migrator.migrate(migrations).pipe(
  Effect.mapError((cause) => new Error({ cause })),
);
