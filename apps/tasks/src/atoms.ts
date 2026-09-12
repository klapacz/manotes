import type { NodeServices } from "@effect/platform-node";
import { Context, Effect, Layer, Stream } from "effect";
import { Atom } from "effect/unstable/reactivity";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { createContext, useContext } from "solid-js";
import * as Backend from "./backend";

// Based on klagent/apps/tui/src/atom/registry.ts at 047ba588d95758d3c3d7777e8862b24c22744ed8.
// Uses Effect / atom-solid 4.0.0-rc.112 here. Keep the CLI's scoped services and
// Reactivity instance instead of creating a second database/sync runtime.
export const make = Effect.gen(function* () {
  const backend = yield* Backend.make;
  const context = yield* Effect.context<NodeServices.NodeServices | Reactivity.Reactivity>();

  const runtime = Atom.context()(
    Layer.succeedContext(Context.add(context, Backend.Service, backend)),
  );

  return { runtime, start: backend.start };
});

export type Runtime = Effect.Success<typeof make>["runtime"];

const RuntimeContext = createContext<Runtime>();

export const Provider = RuntimeContext.Provider;

export const tasks = bindRt((rt) =>
  rt.atom(Backend.Service.useSync((backend) => backend.tasks).pipe(Stream.unwrap)),
);

export const status = bindRt((rt) =>
  rt.atom(Backend.Service.useSync((backend) => backend.status).pipe(Stream.unwrap)),
);

export const open = bindRt((rt) =>
  rt.fn(
    Effect.fn("TasksAtoms.open")(function* (id: string) {
      const backend = yield* Backend.Service;
      yield* backend.open(id);

      return id;
    }),
  ),
);

// Same per-runtime cache as apps/web/src/lib/rt-atom.ts, using the CLI runtime
// context rather than the browser's graph runtime.
export function bindRt<T>(creator: (rt: Runtime) => T) {
  const cache = new WeakMap<Runtime, T>();

  return () => {
    const runtime = useContext(RuntimeContext);

    if (!runtime) throw new Error("TasksAtoms.bindRt must be used within TasksAtoms.Provider");

    const cached = cache.get(runtime);

    if (cached !== undefined) return cached;

    const bound = creator(runtime);
    cache.set(runtime, bound);

    return bound;
  };
}

export * as TasksAtoms from "./atoms";
