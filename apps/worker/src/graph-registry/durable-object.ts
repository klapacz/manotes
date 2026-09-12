import * as Cloudflare from "alchemy/Cloudflare";
import { SqliteClient } from "@effect/sql-sqlite-do";
import { DisplayNameTakenError, GraphRegistryRpc } from "@manotes/shared/graph-registry/contract";
import { Effect, Layer, Option, Predicate, Scope, Context } from "effect";
import { HttpServerRequest, HttpServerResponse } from "effect/unstable/http";
import { RpcSerialization, RpcServer } from "effect/unstable/rpc";
import * as Repo from "./repo.ts";

// ---------------------------------------------------------------------------
// RPC HttpApp tag
// ---------------------------------------------------------------------------

class RpcHttpApp extends Context.Service<
  RpcHttpApp,
  Effect.Effect<
    HttpServerResponse.HttpServerResponse,
    never,
    Scope.Scope | HttpServerRequest.HttpServerRequest
  >
>()("GraphRegistry.RpcHttpApp") {}

// ---------------------------------------------------------------------------
// RPC handler implementations
// ---------------------------------------------------------------------------

const HandlersLayer = GraphRegistryRpc.toLayer(
  Effect.gen(function* () {
    const repo = yield* Repo.Service;

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

// ---------------------------------------------------------------------------
// Layer that creates the long-lived RPC HttpApp
// ---------------------------------------------------------------------------

const RpcHttpAppLayer = Layer.effect(RpcHttpApp, RpcServer.toHttpEffect(GraphRegistryRpc));

// ---------------------------------------------------------------------------
// Durable Object
// ---------------------------------------------------------------------------

export default class GraphRegistryDurableObject extends Cloudflare.DurableObjectNamespace<GraphRegistryDurableObject>()(
  "GraphRegistryDurableObject",
  // oxlint-disable-next-line require-yield
  Effect.gen(function* () {
    return Effect.gen(function* () {
      const state = yield* Cloudflare.DurableObjectState;

      const layer = RpcHttpAppLayer.pipe(
        Layer.provide(HandlersLayer),
        Layer.provide(RpcSerialization.layerJson),
        Layer.provideMerge(Repo.Service.layer),
        Layer.provideMerge(
          SqliteClient.layer({
            db: state.storage.sql.raw,
            spanAttributes: { durableObject: "GraphRegistryDurableObject" },
          }),
        ),
      );

      yield* state.blockConcurrencyWhile(() =>
        Repo.migrate.pipe(Effect.provide(layer), Effect.orDie),
      );

      return {
        fetch: Effect.gen(function* () {
          const httpApp = yield* RpcHttpApp;

          return yield* httpApp;
        }).pipe(Effect.scoped, Effect.provide(layer)),

        graphExists: Effect.fn(function* (graphId: string) {
          const repo = yield* Repo.Service;
          const graph = yield* repo.getGraph({ graphId });

          return Option.isSome(graph);
        }, Effect.provide(layer)),
      };
    });
  }),
) {}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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
