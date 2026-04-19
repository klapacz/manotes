import { Context } from "effect";

export class Env extends Context.Service<Env, globalThis.Env>()("Worker.Env") {}
