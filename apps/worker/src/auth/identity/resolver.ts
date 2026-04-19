import { Effect, Layer, Context } from "effect";
import { HttpServerRequest } from "effect/unstable/http";
import * as Worker from "../../http/worker";
import * as AuthErrors from "../errors";
import * as CloudflareAccess from "./cloudflare-access";
import * as Dev from "./dev";

export type Identity = {
  readonly email: string;
};

type ResolveIdentity = () => Effect.Effect<
  Identity,
  AuthErrors.UnauthorizedError,
  Worker.Env | HttpServerRequest.HttpServerRequest
>;

export class Service extends Context.Service<Service, { readonly resolve: ResolveIdentity }>()(
  "Worker.AuthIdentity",
) {
  static readonly layer = Layer.succeed(this, {
    resolve: import.meta.env.DEV ? Dev.resolve : CloudflareAccess.resolve,
  });
}
