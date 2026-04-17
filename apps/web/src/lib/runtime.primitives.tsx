import { createContext, useContext, type JSX } from "solid-js";
import type * as Runtime from "./graph-access/graph-runtime/layer";

export const RuntimeContext = createContext<() => Runtime.Type>(null!);

export function RuntimeProvider(props: { children: JSX.Element; runtime: () => Runtime.Type }) {
  return <RuntimeContext.Provider value={props.runtime}>{props.children}</RuntimeContext.Provider>;
}

export function useRuntime() {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("can't find CounterContext");
  return runtime;
}
