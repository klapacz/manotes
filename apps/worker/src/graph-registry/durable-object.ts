import * as Cloudflare from "@alchemy.run/cloudflare";
import { SqliteClient } from "@effect/sql-sqlite-do";
import { DisplayNameTakenError, GraphRegistryRpc } from "@manotes/shared/graph-registry/contract";
import { Effect, Layer, Predicate } from "effect";
import { GraphRegistryRepo } from "./repo.ts";

export default class GraphRegistryDurableObject extends Cloudflare.RpcDurableObject<GraphRegistryDurableObject>()(
  "GraphRegistryDurableObject",
  { schema: GraphRegistryRpc },
  // oxlint-disable-next-line require-yield
  Effect.gen(function* () {
    return Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;

      const layer = GraphRegistryRepo.Service.layer.pipe(
        Layer.provideMerge(
          SqliteClient.layer({
            db: state.storage.sql.raw,
            spanAttributes: { durableObject: "GraphRegistryDurableObject" },
          }),
        ),
      );

      yield* state.blockConcurrencyWhile(() => {
        return GraphRegistryRepo.migrate.pipe(Effect.provide(layer), Effect.orDie);
      });

      return HandlersLayer.pipe(Layer.provide(layer));
    });
  }),
) {}

const HandlersLayer = GraphRegistryRpc.toLayer(
  Effect.gen(function* () {
    const repo = yield* GraphRegistryRepo.Service;

    return {
      listGraphs: Effect.fn("GraphRegistry.listGraphs")(function* () {
        return yield* repo.listGraphs().pipe(Effect.orDie);
      }),

      createGraph: Effect.fn("GraphRegistry.createGraph")(function* ({
        displayName,
        graphKeyEnvelope,
      }) {
        return yield* narrowError(repo.createGraph({ displayName, graphKeyEnvelope }));
      }),

      getGraph: Effect.fn("GraphRegistry.getGraph")(function* ({ graphId }) {
        return yield* repo.getGraph({ graphId }).pipe(Effect.orDie);
      }),

      renameGraph: Effect.fn("GraphRegistry.renameGraph")(function* ({ graphId, displayName }) {
        return yield* narrowError(repo.renameGraph({ graphId, displayName }));
      }),
    };
  }),
);

/**
 * Keep `DisplayNameTakenError` in the error channel and turn every other
 * error (SqlError, ParseError, …) into a defect.
 */
function narrowError<A, R, E>(
  effect: Effect.Effect<A, DisplayNameTakenError | E, R>,
): Effect.Effect<A, DisplayNameTakenError, R> {
  return effect.pipe(
    Effect.catch((e) => {
      if (Predicate.isTagged(e, "GraphRegistry.DisplayNameTakenError")) return Effect.fail(e);

      return Effect.die(e);
    }),
  );
}
