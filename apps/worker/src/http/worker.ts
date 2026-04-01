import * as ServiceMap from "effect/ServiceMap";

export class Env extends ServiceMap.Service<Env, globalThis.Env>()("Worker.Env") {}
