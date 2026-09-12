import type { Atom } from "effect/unstable/reactivity";
import { useGraph } from "./graph-access/graph-runtime/context";

function createBindRt<R, ER>(getRt: () => Atom.AtomRuntime<R, ER>) {
  return <T>(creator: (rt: Atom.AtomRuntime<R, ER>) => T) => {
    const cache = new WeakMap<Atom.AtomRuntime<R, ER>, T>();

    return () => {
      const rt = getRt();

      const cached = cache.get(rt);

      if (cached !== undefined) return cached;

      const bound = creator(rt);
      cache.set(rt, bound);

      return bound;
    };
  };
}

export const bindRt = createBindRt(() => useGraph()().runtime.atom);
