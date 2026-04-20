import { Effect, Layer, Context } from "effect";
import { AtomRegistry, Atom as A } from "effect/unstable/reactivity";
import * as Atom from "./atom";

export class Service extends Context.Service<Service>()("GraphAccess.Session.Service", {
  make: Effect.gen(function* () {
    const registry = yield* AtomRegistry.AtomRegistry;

    const get = AtomRegistry.getResult(registry, Atom.get);
    const find = AtomRegistry.getResult(registry, Atom.find);
    const refresh = Effect.sync(() => registry.refresh(Atom.get));

    const stream = {
      get: A.toStreamResult(Atom.get),
      find: A.toStreamResult(Atom.find),
    };

    return { get, find, refresh, stream };
  }),
}) {
  static readonly layer = Layer.effect(this, this.make);
}
