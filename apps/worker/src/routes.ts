import * as SessionAuth from "@manotes/shared/session/auth";
import { Effect, Layer, pipe, Result, Schema } from "effect";
import {
  HttpRouter,
  HttpServerError,
  HttpServerRequest,
  HttpServerResponse,
} from "effect/unstable/http";
import * as AuthSession from "./auth/session.ts";
import * as SessionRoutes from "./session/routes.ts";
import GraphRegistryDurableObject from "./graph-registry/durable-object.ts";
import GraphSyncDurableObject from "./graph-sync/durable-object.ts";

const GraphIdParams = Schema.Struct({ graphId: Schema.NonEmptyString });

export const protectedRoutesLayer = HttpRouter.addAll(
  Effect.gen(function* () {
    const graphRegistryNS = yield* GraphRegistryDurableObject;
    const graphSyncNS = yield* GraphSyncDurableObject;

    const proxyToGraphRegistry = Effect.fn("Routes.proxyToGraphRegistry")(function* () {
      const session = yield* SessionAuth.Current;
      const registry = graphRegistryNS.getByName(session.accountId);
      const request = yield* HttpServerRequest.HttpServerRequest;

      return yield* registry.fetch(request);
    });

    const proxyToGraphSync = Effect.fn("Routes.proxyToGraphSync")(function* ({
      params,
    }: {
      params: typeof GraphIdParams.Type;
    }) {
      const session = yield* SessionAuth.Current;
      const registry = graphRegistryNS.getByName(session.accountId);
      const exists = yield* registry.graphExists(params.graphId).pipe(Effect.orDie);
      const request = yield* HttpServerRequest.HttpServerRequest;

      if (exists === false) {
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
      HttpRouter.route("POST", "/api/rpc/graph-registry", () => proxyToGraphRegistry()),
      HttpRouter.route("*", "/api/sync/:graphId", () =>
        pipe(
          pathParam,
          Effect.flatMap((params) => proxyToGraphSync({ params })),
        ),
      ),
      HttpRouter.route("*", "/api/*", () =>
        HttpServerResponse.json({ error: "Not found" }, { status: 404 }),
      ),
    ] as const;
  }),
).pipe(Layer.provide(AuthSession.RouterMiddleware.layer));

export const layer = Layer.mergeAll(
  HttpRouter.add("GET", "/api/health", HttpServerResponse.jsonUnsafe({ ok: true })),
  HttpRouter.add("*", "/*", HttpServerResponse.empty({ status: 404 })),
  SessionRoutes.layer.pipe(Layer.provide(AuthSession.HttpApiMiddlewareLayer)),
  protectedRoutesLayer,
);
