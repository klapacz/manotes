import { Effect, Layer, Context } from "effect";
import { AtomRegistry, Atom } from "effect/reactivity";
import { SessionAtom } from "./atom";

export class Service extends Context.Service<Service>()("GraphAccess.Session.Service", {
  make: Effect.gen(function* () {
    const registry = yield* AtomRegistry.AtomRegistry;

    const get = AtomRegistry.getResult(registry, SessionAtom.get);
    const find = AtomRegistry.getResult(registry, SessionAtom.find);
    const refresh = Effect.sync(() => registry.refresh(SessionAtom.get));

    const stream = {
      get: Atom.toStreamResult(SessionAtom.get),
      find: Atom.toStreamResult(SessionAtom.find),
    };

    return { get, find, refresh, stream };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}

export * as SessionService from "./service";
