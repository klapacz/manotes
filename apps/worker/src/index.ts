import * as Alchemy from "alchemy";
import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import { Effect, Layer } from "effect";
import { HttpMiddleware, HttpRouter, HttpServer, HttpServerRequest } from "effect/unstable/http";
import { AuthService } from "./auth/auth.ts";
import { EmailService } from "./auth/email.ts";
import { OtpService } from "./auth/otp.ts";
import { SessionKvService } from "./auth/session-kv.ts";
import * as Routes from "./routes.ts";

const layerCloudflareBindings = Layer.mergeAll(
  Cloudflare.KV.ReadWriteNamespaceBinding,
  Cloudflare.Email.SendBinding,
);

const layerAppServices = AuthService.layer.pipe(
  Layer.provide(Layer.mergeAll(EmailService.layer, OtpService.layer)),
  Layer.provideMerge(SessionKvService.layer),
  Layer.provide(layerCloudflareBindings),
);

const corsMiddleware = HttpMiddleware.cors({
  allowedOrigins: () => true,
  allowedMethods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE", "OPTIONS"],
  credentials: true,
  maxAge: 86400,
});

const corsLayer = HttpRouter.middleware(
  (httpApp) =>
    Effect.gen(function* () {
      const request = yield* HttpServerRequest.HttpServerRequest;

      if (request.headers.upgrade?.toLowerCase() === "websocket") {
        return yield* httpApp;
      }

      return yield* corsMiddleware(httpApp);
    }),
  { global: true },
);

export default class Api extends Cloudflare.Worker<Api>()(
  "Api",
  {
    main: import.meta.filename,
    dev: { port: 3000 },
    routes: Output.fromEffect(
      Alchemy.Stage.useSync((stage) =>
        stage === "prod"
          ? [{ pattern: "sand.manotes.dev/api*", zoneName: "manotes.dev" }]
          : undefined,
      ),
    ),
    // Disable public workers.dev and version-preview URLs; keep the custom route.
    workersDev: false,
  },
  Effect.gen(function* () {
    // The router layers only register handler closures and provide pure services, so no
    // scoped resources escape initialization. Alchemy still supplies each request's Scope.
    return {
      fetch: yield* Routes.layer.pipe(
        Layer.provide(corsLayer),
        Layer.provide(HttpServer.layerServices),
        HttpRouter.toHttpEffect,
        Effect.scoped,
      ),
    };
  }).pipe(Effect.provide(layerAppServices)),
) {}
