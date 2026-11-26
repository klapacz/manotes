import { SessionAuth } from "@manotes/shared/session/auth";
import { Effect, Layer, Option, pipe, Result, Schema } from "effect";
import { HttpRouter, HttpServerError, HttpServerRequest, HttpServerResponse } from "effect/http";
import { AuthSession } from "./auth/session.ts";
import { McpRoutes } from "./mcp/routes.ts";
import { SessionRoutes } from "./session/routes.ts";
import GraphRegistryDurableObject from "./graph-registry/durable-object.ts";
import GraphSyncDurableObject from "./graph-sync/durable-object.ts";

const GraphIdParams = Schema.Struct({ graphId: Schema.NonEmptyString });

export const protectedRoutesLayer = HttpRouter.addAll(
  Effect.gen(function* () {
    const graphRegistryNS = yield* GraphRegistryDurableObject;
    const graphSyncNS = yield* GraphSyncDurableObject;
    const withSession = yield* AuthSession.RouterMiddleware;

    const proxyToGraphRegistry = Effect.fn("Routes.proxyToGraphRegistry")(function* () {
      const session = yield* SessionAuth.Current;
      const request = yield* HttpServerRequest.HttpServerRequest;

      return yield* graphRegistryNS.fetch(session.accountId, request);
    });

    const proxyToGraphSync = Effect.fn("Routes.proxyToGraphSync")(function* ({
      params,
    }: {
      params: typeof GraphIdParams.Type;
    }) {
      const session = yield* SessionAuth.Current;
      const registry = yield* graphRegistryNS.getByName(session.accountId);
      const graph = yield* registry.getGraph({ graphId: params.graphId }).pipe(Effect.orDie);
      const request = yield* HttpServerRequest.HttpServerRequest;

      if (Option.isNone(graph)) {
        return HttpServerResponse.jsonUnsafe({ error: "Not found" }, { status: 404 });
      }

      if (request.headers.upgrade !== "websocket") {
        return HttpServerResponse.text("Expected Upgrade: websocket", { status: 426 });
      }

      const DO = graphSyncNS.getByName(JSON.stringify([session.accountId, params.graphId]));

      return yield* DO.fetch(request);
    });

    const pathParam = HttpRouter.schemaPathParams(GraphIdParams).pipe(
      Effect.result,
      Effect.flatMap(
        Effect.fnUntraced(function* (result) {
          if (Result.isSuccess(result)) return result.success;

          return yield* Effect.fail(
            new HttpServerError.HttpServerError({
              reason: new HttpServerError.RequestParseError({
                request: yield* HttpServerRequest.HttpServerRequest,
                cause: result.failure,
              }),
            }),
          );
        }),
      ),
    );

    return [
      HttpRouter.route("POST", "/api/rpc/graph-registry", () => {
        return withSession(proxyToGraphRegistry());
      }),
      HttpRouter.route("*", "/api/sync/:graphId", () => {
        return withSession(
          pipe(
            pathParam,
            Effect.flatMap((params) => proxyToGraphSync({ params })),
          ),
        );
      }),
      HttpRouter.route("*", "/api/*", () => {
        return withSession(HttpServerResponse.json({ error: "Not found" }, { status: 404 }));
      }),
    ] as const;
  }),
);

export const layer = Layer.mergeAll(
  HttpRouter.add("GET", "/api/health", HttpServerResponse.jsonUnsafe({ ok: true })),
  HttpRouter.add("*", "/*", HttpServerResponse.empty({ status: 404 })),
  SessionRoutes.layer,
  McpRoutes.layer,
  protectedRoutesLayer,
);

export * as Routes from "./routes.ts";
