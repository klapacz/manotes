import * as HttpServerRequest from "@effect/platform/HttpServerRequest";
import * as HttpServerResponse from "@effect/platform/HttpServerResponse";
import type * as HttpApp from "@effect/platform/HttpApp";
import { RpcServer, RpcSerialization } from "@effect/rpc";
import { SqliteClient } from "@effect/sql-sqlite-do";
import { Context, Effect, Layer, ManagedRuntime, Option, Predicate, Scope } from "effect";
import { DurableObject } from "cloudflare:workers";
import { GraphRegistryRpc } from "@manotes/shared/graph-registry/contract";
import type { DisplayNameTakenError } from "@manotes/shared/graph-registry/contract";
import * as Repo from "./repo";

// ---------------------------------------------------------------------------
// RPC HttpApp tag
// ---------------------------------------------------------------------------

class RpcHttpApp extends Context.Tag("GraphRegistry.RpcHttpApp")<
  RpcHttpApp,
  HttpApp.Default<never, Scope.Scope>
>() {}

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

const RpcHttpAppLayer = Layer.scoped(RpcHttpApp, RpcServer.toHttpApp(GraphRegistryRpc));

// ---------------------------------------------------------------------------
// Durable Object
// ---------------------------------------------------------------------------

export class GraphRegistryDurableObject extends DurableObject<Env> {
  private readonly runtime = ManagedRuntime.make(
    RpcHttpAppLayer.pipe(
      Layer.provide(HandlersLayer),
      Layer.provide(RpcSerialization.layerJson),
      Layer.provideMerge(Repo.Service.Default),
      Layer.provideMerge(
        SqliteClient.layer({
          db: this.ctx.storage.sql,
          spanAttributes: { durableObject: "GraphRegistryDurableObject" },
        }),
      ),
    ),
  );

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    void ctx.blockConcurrencyWhile(() => this.runtime.runPromise(Repo.migrate));
  }

  async fetch(request: Request): Promise<Response> {
    return this.runtime.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const httpApp = yield* RpcHttpApp;
          const response = yield* httpApp.pipe(
            Effect.provideService(
              HttpServerRequest.HttpServerRequest,
              HttpServerRequest.fromWeb(request),
            ),
          );
          return HttpServerResponse.toWeb(response);
        }),
      ),
    );
  }

  async graphExists(graphId: string): Promise<boolean> {
    return this.runtime.runPromise(
      Effect.gen(function* () {
        const repo = yield* Repo.Service;
        const graph = yield* repo.getGraph({ graphId });
        return Option.isSome(graph);
      }),
    );
  }
}

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
    Effect.catchAll((e) => {
      if (Predicate.isTagged(e, "GraphRegistry.DisplayNameTakenError")) return Effect.fail(e);
      return Effect.die(e);
    }),
  );
}
