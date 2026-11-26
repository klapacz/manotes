import { McpToken } from "@manotes/shared/mcp/token";
import { Effect, Option, Schema } from "effect";
import { HttpRouter, HttpServerRequest, HttpServerResponse } from "effect/http";
import GraphRegistryDurableObject from "../graph-registry/durable-object.ts";
import GraphSyncDurableObject from "../graph-sync/durable-object.ts";

const TokenParams = Schema.Struct({ token: Schema.NonEmptyString });

/** Validates `:token` and forwards MCP HTTP traffic to the target graph's `GraphSyncDurableObject`. */
export const layer = HttpRouter.addAll(
  Effect.gen(function* () {
    const graphRegistryNS = yield* GraphRegistryDurableObject;
    const graphSyncNS = yield* GraphSyncDurableObject;

    const forwardToGraph = Effect.fn("McpRoutes.forwardToGraph")(function* () {
      const params = yield* HttpRouter.schemaPathParams(TokenParams).pipe(Effect.option);

      if (Option.isNone(params)) {
        return HttpServerResponse.jsonUnsafe({ error: "Invalid MCP token." }, { status: 400 });
      }

      const decoded = yield* McpToken.decode(params.value.token).pipe(Effect.option);

      if (Option.isNone(decoded)) {
        return HttpServerResponse.jsonUnsafe({ error: "Invalid MCP token." }, { status: 400 });
      }

      const { accountId, graphId } = decoded.value;
      const registry = yield* graphRegistryNS.getByName(accountId);
      const graph = yield* registry.getGraph({ graphId }).pipe(Effect.orDie);

      if (Option.isNone(graph)) {
        return HttpServerResponse.jsonUnsafe({ error: "Graph not found." }, { status: 404 });
      }

      const request = yield* HttpServerRequest.HttpServerRequest;

      // Never forward WebSocket upgrades to GraphSyncDurableObject from the unauthenticated MCP route.
      if (request.headers.upgrade !== undefined) return HttpServerResponse.empty({ status: 400 });

      return yield* graphSyncNS.getByName(JSON.stringify([accountId, graphId])).fetch(request);
    });

    return [HttpRouter.route("*", "/mcp/:token", () => forwardToGraph())] as const;
  }),
);

export * as McpRoutes from "./routes.ts";
