import type { Atom } from "effect/unstable/reactivity";
import { getOwner, runWithOwner } from "solid-js";
import { useGraph } from "./graph-access/graph-runtime/context";

function createBindRt<R, ER>(getRt: () => Atom.AtomRuntime<R, ER>) {
  return <T>(creator: (rt: Atom.AtomRuntime<R, ER>) => T) => {
    const cache = new WeakMap<Atom.AtomRuntime<R, ER>, T>();
    // Atoms call bound accessors while the registry rebuilds them, often from
    // unowned Solid 2 effect callbacks. Resolve context from the creating
    // component; module-level bindings resolve from the caller.
    const owner = getOwner();

    return () => {
      const rt = owner ? runWithOwner(owner, getRt) : getRt();

      const cached = cache.get(rt);

      if (cached !== undefined) return cached;

      const bound = creator(rt);
      cache.set(rt, bound);

      return bound;
    };
  };
}

export const bindRt = createBindRt(() => useGraph()().runtime.atom);
