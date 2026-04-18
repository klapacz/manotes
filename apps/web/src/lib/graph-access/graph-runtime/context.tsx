import { createContext, useContext, type JSX } from "solid-js";
import { Types } from "effect";
import type { State } from "./manager";

export type Context = Types.ExtractTag<State, "Ready">;

const GraphContext = createContext<() => Context>(null!);

export function GraphProvider(props: { graph: () => Context; children: JSX.Element }) {
  return <GraphContext.Provider value={props.graph}>{props.children}</GraphContext.Provider>;
}

export function useGraph() {
  const graph = useContext(GraphContext);
  if (!graph) throw new Error("Missing GraphContext");
  return graph;
}
