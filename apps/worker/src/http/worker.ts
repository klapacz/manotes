import * as Context from "effect/Context";

export class Env extends Context.Service<Env, globalThis.Env>()("Worker.Env") {}
