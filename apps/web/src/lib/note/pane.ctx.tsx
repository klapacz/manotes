import { linkOptions } from "@tanstack/solid-router";
import {
  createContext,
  createMemo,
  useContext,
  type Accessor,
  type JSX,
  type ParentProps,
} from "solid-js";
import { PaneCursor } from "./pane.cursor";
import { PaneSchema } from "./pane.schema";

export type Ctx = {
  stack: Accessor<PaneCursor.Stack>;
  index: Accessor<number>;
  pane: Accessor<PaneSchema.Pane>;
};

const Context = createContext<Ctx | null>(null);

export function Provider(props: ParentProps<Ctx>): JSX.Element {
  return (
    <Context.Provider
      value={{
        stack: props.stack,
        index: props.index,
        pane: props.pane,
      }}
    >
      {props.children}
    </Context.Provider>
  );
}

export function use(): Ctx {
  const ctx = useContext(Context);

  if (!ctx) throw new Error("Must use inside PaneCtx.Provider");

  return ctx;
}

export function usePane(): Accessor<PaneSchema.Pane> {
  return use().pane;
}

export function useNote(): Accessor<PaneSchema.PaneNote> {
  const pane = usePane();

  return createMemo(() => {
    const current = pane();

    if (!PaneSchema.Pane.guards.note(current)) throw new Error("Current pane is not a note");

    return current;
  });
}

export function useStream(): Accessor<PaneSchema.PaneStream> {
  const pane = usePane();

  return createMemo(() => {
    const current = pane();

    if (!PaneSchema.Pane.guards.stream(current)) throw new Error("Current pane is not a stream");

    return current;
  });
}

export function toCursor(ctx: Pick<Ctx, "stack" | "index">): PaneCursor.Cursor {
  return {
    stack: ctx.stack(),
    index: ctx.index(),
  };
}

export function paneLinkOptions(ctx: Ctx, transform: PaneCursor.Transform) {
  return linkOptions({
    from: "/$graph/",
    to: "/$graph",
    search: { panes: transform(toCursor(ctx)) },
    viewTransition: false,
  });
}

export { paneLinkOptions as linkOptions };

export * as PaneCtx from "./pane.ctx";
