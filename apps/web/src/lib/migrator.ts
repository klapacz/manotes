import { Data, Effect } from "effect";
import * as Migrator from "@manotes/shared/migrator";
import { Migrations } from "../../migrations/migrations";

class Error extends Data.TaggedError("Migrator.Error")<{
  cause: Effect.Error<ReturnType<typeof Migrator.migrate>>;
}> {}

export const migrate = Migrator.migrate(Migrations.migrations).pipe(
  Effect.mapError((cause) => new Error({ cause })),
);
