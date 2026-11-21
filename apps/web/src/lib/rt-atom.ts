import type { Stream } from "effect";
import type { Atom } from "effect/reactivity";
import type { Accessor } from "solid-js";
import { createEffectStream } from "./atom-bridge";
import { GraphRuntimeContext } from "./graph-access/graph-runtime/context";
import type { RuntimeContext } from "./graph-access/graph-runtime/manager";

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

export const bindRt = createBindRt(() => GraphRuntimeContext.use()().runtime.atom);

export function useGraphStream<A, E>(
  stream: Accessor<Stream.Stream<A, E, RuntimeContext>>,
  options?: { readonly deferred?: boolean },
): Accessor<A> {
  const graph = GraphRuntimeContext.use();

  return createEffectStream(() => graph().runtime, stream, options);
}
