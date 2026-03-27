import { createContext, useContext, type JSX } from "solid-js";
import { createStreamStore } from "./primitives";
import type * as Runtime from "./runtime";
import type { ManagedRuntime, Stream } from "effect";

export const RuntimeContext = createContext<() => Runtime.Type>(null!);

export function RuntimeProvider(props: { children: JSX.Element; runtime: () => Runtime.Type }) {
  return <RuntimeContext.Provider value={props.runtime}>{props.children}</RuntimeContext.Provider>;
}

export function useRuntime() {
  const runtime = useContext(RuntimeContext);
  if (!runtime) throw new Error("can't find CounterContext");
  return runtime;
}

type RuntimeRequirements =
  Runtime.Type extends ManagedRuntime.ManagedRuntime<infer R, infer _E> ? R : never;

export function createRuntimeStreamStore<A extends object, E>(
  stream: () => Stream.Stream<A, E, RuntimeRequirements>,
  staticInitialValue: NoInfer<A>,
) {
  const runtime = useRuntime();

  return createStreamStore(
    () => ({
      runtime: runtime(),
      stream: stream(),
    }),
    staticInitialValue,
  );
}

export interface RunStreamProps<A extends object, E> {
  stream: () => Stream.Stream<A, E, RuntimeRequirements>;
  staticInitialValue: NoInfer<A>;
  children: (value: A) => JSX.Element;
}

export function RunStream<A extends object, E>(props: RunStreamProps<A, E>) {
  const value = createRuntimeStreamStore(props.stream, props.staticInitialValue);

  return props.children(value);
}
