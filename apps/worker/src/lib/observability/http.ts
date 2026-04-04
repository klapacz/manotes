import { Layer } from "effect";
import * as HttpMiddleware from "effect/unstable/http/HttpMiddleware";
import * as HttpRouter from "effect/unstable/http/HttpRouter";

export const layer = import.meta.env.DEV
  ? HttpRouter.middleware(HttpMiddleware.tracer, { global: true })
  : Layer.empty;
