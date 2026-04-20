import { Effect, Layer, pipe, Schema } from "effect";
import { HttpRouter, HttpServerResponse } from "effect/unstable/http";
import * as AuthSession from "./auth/session";
import * as Worker from "./http/worker";
import * as WebRequest from "./http/web-request";
import * as SessionRoutes from "./session/routes";

const GraphIdParams = Schema.Struct({ graphId: Schema.NonEmptyString });

const protectedRoutesLayer = Layer.mergeAll(
  SessionRoutes.layer,
  // /login triggers Cloudflare Access auth (validates CF_Authorization cookie).
  // If not authenticated → Access shows login page. If authenticated → redirect to /.
  HttpRouter.add("GET", "/login", HttpServerResponse.redirect("/")),
  HttpRouter.add("POST", "/api/rpc/graph-registry", () => proxyToGraphRegistry()),
  HttpRouter.add("*", "/api/sync/:graphId", () =>
    pipe(
      HttpRouter.schemaPathParams(GraphIdParams),
      Effect.flatMap((params) => proxyToGraphSync({ pathname: "/", params })),
    ),
  ),
  HttpRouter.add("*", "/api/sync/:graphId/health", () =>
    pipe(
      HttpRouter.schemaPathParams(GraphIdParams),
      Effect.flatMap((params) => proxyToGraphSync({ pathname: "/health", params })),
    ),
  ),
  HttpRouter.add(
    "*",
    "/api/*",
    HttpServerResponse.jsonUnsafe({ error: "Not found" }, { status: 404 }),
  ),
).pipe(Layer.provide(AuthSession.Middleware.layer));

export const layer = Layer.mergeAll(
  HttpRouter.add("GET", "/api/health", HttpServerResponse.jsonUnsafe({ ok: true })),
  HttpRouter.add("*", "/*", HttpServerResponse.empty({ status: 404 })),
  protectedRoutesLayer,
);

const proxyToGraphRegistry = Effect.fn("Routes.proxyToGraphRegistry")(function* () {
  const env = yield* Worker.Env;
  const session = yield* AuthSession.Current;
  const request = yield* WebRequest.get();

  const response = yield* Effect.tryPromise({
    try: () => {
      const registry = env.GRAPH_REGISTRY_DO.getByName(session.accountId);
      return registry.fetch(request);
    },
    catch: (cause) => new Error("Failed to reach graph registry", { cause }),
  });
  return HttpServerResponse.raw(response);
});

const proxyToGraphSync = Effect.fn("Routes.proxyToGraphSync")(function* ({
  pathname,
  params,
}: {
  pathname: string;
  params: typeof GraphIdParams.Type;
}) {
  const env = yield* Worker.Env;
  const session = yield* AuthSession.Current;
  const exists = yield* Effect.tryPromise({
    try: () => {
      const registry = env.GRAPH_REGISTRY_DO.getByName(session.accountId);
      return registry.graphExists(params.graphId);
    },
    catch: (cause) => new Error("Failed to check graph existence", { cause }),
  });

  if (exists === false) {
    return HttpServerResponse.jsonUnsafe({ error: "Not found" }, { status: 404 });
  }

  const request = yield* WebRequest.get();
  const response = yield* Effect.tryPromise({
    try: () => {
      const durableObject = env.GRAPH_SYNC_DO.getByName(
        JSON.stringify([session.accountId, params.graphId]),
      );
      const durableObjectUrl = new URL(request.url);
      durableObjectUrl.pathname = pathname;

      return durableObject.fetch(new Request(durableObjectUrl, request));
    },
    catch: (cause) => new Error("Failed to reach graph sync", { cause }),
  });

  return HttpServerResponse.raw(response);
});
