import * as Cloudflare from "alchemy/Cloudflare";
import * as Output from "alchemy/Output";
import { Effect, Layer } from "effect";
import { HttpMiddleware, HttpRouter, HttpServer, HttpServerRequest } from "effect/unstable/http";
import { AuthService } from "./auth/auth.ts";
import { EmailService } from "./auth/email.ts";
import { OtpService } from "./auth/otp.ts";
import { SessionKvService } from "./auth/session-kv.ts";
import * as Routes from "./routes.ts";
import * as Alchemy from "alchemy";

const layerCloudflareBindings = Layer.mergeAll(
  Cloudflare.KVNamespaceBindingLive,
  Cloudflare.SendEmailBindingLive,
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

export default Cloudflare.Worker(
  "Api",
  {
    main: import.meta.filename,
    dev: { port: 3000 },
    // Nested raw Effects in props are not resolved by Alchemy's input walker,
    // so wrap the stage-dependent routes as an Output for deploy-time resolution.
    // asOutput's type only accepts no-requirement Effects; Alchemy provides Stage while planning.
    routes: Output.asOutput(
      Alchemy.Stage.useSync((stage) =>
        stage === "prod"
          ? [{ pattern: "sand.manotes.dev/api*", zoneName: "manotes.dev" }]
          : undefined,
      ) as Effect.Effect<Cloudflare.WorkerRouteProps[] | undefined>,
    ),
    url: false,
  },
  Effect.gen(function* () {
    return {
      fetch: yield* Routes.layer.pipe(
        Layer.provide(corsLayer),
        Layer.provide(HttpServer.layerServices),
        HttpRouter.toHttpEffect,
      ),
    };
  }).pipe(Effect.provide(layerAppServices)),
);
