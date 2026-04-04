import { Layer } from "effect";
import { HttpRouter, HttpServer } from "effect/unstable/http";
import { AccountsDurableObject } from "./accounts/durable-object";
import { AuthService } from "./auth/auth";
import { EmailService } from "./auth/email";
import { OtpService } from "./auth/otp";
import { SessionKvService } from "./auth/session-kv";
import { GraphRegistryDurableObject } from "./graph-registry/durable-object";
import { GraphSyncDurableObject } from "./graph-sync/durable-object";
import * as Worker from "./http/worker";
import * as HttpObservability from "./lib/observability/http";
import * as OtlpWorker from "./lib/observability/otlp-worker";
import * as Routes from "./routes";
import { env } from "cloudflare:workers";

export { AccountsDurableObject, GraphSyncDurableObject, GraphRegistryDurableObject };

const AppLayer = Routes.layer.pipe(
  Layer.provide(HttpServer.layerServices),
  Layer.provideMerge(HttpObservability.layer),
  Layer.provideMerge(AuthService.layer),
  Layer.provideMerge(EmailService.layer),
  Layer.provideMerge(OtpService.layer),
  Layer.provideMerge(SessionKvService.layer),
  Layer.provideMerge(OtlpWorker.makeImmediateLayer("manotes-api")),
  Layer.provideMerge(Layer.succeed(Worker.Env, env)),
);

const { handler } = HttpRouter.toWebHandler(AppLayer);

export default {
  fetch(request: Request) {
    return handler(request);
  },
};
