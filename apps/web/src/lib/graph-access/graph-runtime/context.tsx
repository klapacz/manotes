import { createContext, useContext } from "solid-js";
import type { JSX } from "@solidjs/web";
import { Types } from "effect";
import type { State } from "./manager";

export type Context = Types.ExtractTag<State, "Ready">;

const GraphContext = createContext<() => Context>(null!);

export function GraphProvider(props: { graph: () => Context; children: JSX.Element }) {
  return <GraphContext value={props.graph}>{props.children}</GraphContext>;
}

export function useGraph() {
  const graph = useContext(GraphContext);

  if (!graph) throw new Error("Missing GraphContext");

  return graph;
}
