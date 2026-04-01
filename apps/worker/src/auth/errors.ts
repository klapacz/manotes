import { Effect } from "effect";
import * as Data from "effect/Data";
import { HttpServerRespondable, HttpServerResponse } from "effect/unstable/http";

export class UnauthorizedError extends Data.TaggedError("Auth.UnauthorizedError")<{
  reason: string;
  cause: unknown;
}> {
  [HttpServerRespondable.symbol]() {
    return Effect.succeed(
      HttpServerResponse.jsonUnsafe({ error: "Unauthorized" }, { status: 401 }),
    );
  }
}
