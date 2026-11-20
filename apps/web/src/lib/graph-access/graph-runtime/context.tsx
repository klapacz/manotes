import type { JSX } from "@solidjs/web";
import { createContext, useContext } from "solid-js";
import { Types } from "effect";
import type { State } from "./manager";
import { PrimaryColor } from "../../primary-color";

type Graph = Types.ExtractTag<State, "Ready">;

export type Context = Graph & { primaryColor: PrimaryColor.State };

const GraphContext = createContext<() => Context>(null!);

export function Provider(props: { graph: () => Graph; children: JSX.Element }) {
  const primaryColor = PrimaryColor.use(() => props.graph().record.localGraphId);
  const graph = () => ({ ...props.graph(), primaryColor: primaryColor() });

  return <GraphContext value={graph}>{props.children}</GraphContext>;
}

export function use() {
  const graph = useContext(GraphContext);

  if (!graph) throw new Error("Missing GraphContext");

  return graph;
}

export * as GraphRuntimeContext from "./context";
