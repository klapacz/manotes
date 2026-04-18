import { Data, Effect, Layer, ServiceMap } from "effect";

import * as OPFS from "../../opfs.service";
import * as GraphRuntime from "../graph-runtime";
import * as DBResolution from "../graph-runtime/db-resolution";
import * as LocalRegistry from "../local-registry";

export class LockTimeout extends Data.TaggedError("GraphAccessCommandsDelete.LockTimeout")<{
  localGraphId: string;
}> {}

export class Service extends ServiceMap.Service<Service>()("GraphAccess.Commands.Delete.Service", {
  make: Effect.gen(function* () {
    const runtimeManager = yield* GraphRuntime.Manager.Service;

    const deleteLocal = Effect.fn("GraphAccessCommandsDelete.deleteLocal")(function* (
      localGraphId: string,
    ) {
      yield* LocalRegistry.Repo.markGraphDeleting({ localGraphId });

      // Not required for correctness because `status: "deleting"` resolves to
      // `Missing`, which disposes runtimes reactively. We still remove eagerly
      // here so this tab releases its shared runtime lock immediately.
      yield* runtimeManager.remove(localGraphId);

      yield* Effect.scoped(
        Effect.gen(function* () {
          yield* GraphRuntime.Lock.acquireExclusive(localGraphId).pipe(
            Effect.timeout("10 seconds"),
            Effect.catchTag("TimeoutError", () => Effect.fail(new LockTimeout({ localGraphId }))),
          );

          yield* OPFS.removeFileFromOpfsRoot(DBResolution.getPath(localGraphId)).pipe(
            Effect.catchTag("NotFoundError", () => Effect.void),
          );

          yield* LocalRegistry.Repo.deleteLocalGraph({ localGraphId });
        }),
      );
    });

    return { deleteLocal };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make).pipe(
    Layer.provide(GraphRuntime.Manager.Service.layer),
  );
}
