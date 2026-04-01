import * as Layer from "effect/Layer";
import * as HttpRouter from "effect/unstable/http/HttpRouter";
import * as HttpServer from "effect/unstable/http/HttpServer";
import { AccountsDurableObject } from "./accounts/durable-object";
import * as IdentityResolver from "./auth/identity/resolver";
import { GraphRegistryDurableObject } from "./graph-registry/durable-object";
import { GraphSyncDurableObject } from "./graph-sync/durable-object";
import * as Worker from "./http/worker";
import * as Routes from "./routes";
import { env } from "cloudflare:workers";

export { AccountsDurableObject, GraphSyncDurableObject, GraphRegistryDurableObject };

const { handler } = HttpRouter.toWebHandler(
  Routes.layer.pipe(
    Layer.provide(HttpServer.layerServices),
    Layer.provideMerge(IdentityResolver.Service.layer),
    Layer.provideMerge(Layer.succeed(Worker.Env, env)),
  ),
);

export default {
  fetch(request: Request) {
    return handler(request);
  },
};
