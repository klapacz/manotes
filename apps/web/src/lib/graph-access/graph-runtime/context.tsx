import { createContext, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Types } from "effect";
import { RuntimeContext, type Runtime } from "../../solid-effect";
import type { State } from "./manager";

export type Context = Types.ExtractTag<State, "Ready">;

const GraphContext = createContext<() => Context>(null!);

/** Provides the open graph and makes its runtime the subtree's Effect runtime. */
export function GraphProvider(props: { graph: () => Context; children: JSX.Element }) {
  // The graph's runtime is replaced when its resolution changes; resolve per call.
  const runtime: Runtime<any> = {
    runFork: (effect) => props.graph().runtime.runFork(effect),
    runPromise: (effect) => props.graph().runtime.runPromise(effect),
  };

  return (
    <GraphContext value={props.graph}>
      <RuntimeContext value={runtime}>{props.children}</RuntimeContext>
    </GraphContext>
  );
}

export function useGraph() {
  const graph = useContext(GraphContext);

  if (!graph) throw new Error("Missing GraphContext");

  return graph;
}
