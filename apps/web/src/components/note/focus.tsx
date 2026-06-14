import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onCleanup,
  useContext,
  type Accessor,
  type JSX,
  type ParentProps,
} from "solid-js";
import { createEventListener } from "@solid-primitives/event-listener";
import { PaneCtx } from "../../lib/note/pane.ctx";

type NodeRegistration = {
  readonly id: string;
  readonly parentId: string;
  readonly focus?: () => void;
  readonly focusWithin?: () => void;
  readonly onKeyDown?: (event: KeyboardEvent) => boolean | undefined;
};

type ContextValue = {
  readonly focusedId: Accessor<string | null>;
  readonly register: (registration: () => NodeRegistration) => void;
  readonly createChangeListener: (callback: (id: string) => void) => void;
  readonly focusWhenAvailable: (id: string) => void;
  readonly focusNode: (id: string) => void;
  readonly focusParent: () => void;
  readonly nodes: Map<string, NodeRegistration>;
};

const Context = createContext<ContextValue>();
export const NodeContext = createContext<Accessor<Node>>();

export function use(): ContextValue {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("PaneStreamFocus.use must be used within Provider");
  return ctx;
}

export function Provider(props: ParentProps): JSX.Element {
  const [focusedId, setFocusedId] = createSignal<string | null>(null);
  const nodes = new Map<string, NodeRegistration>();
  const waitingForFocus = new Set<string>();
  const focusChangeListeners = new Set<(id: string) => void>();

  const focusWhenAvailable = (id: string) => {
    const node = nodes.get(id);
    if (node) return focusNode(id);
    waitingForFocus.add(id);
  };

  const focusIfWaiting = (node: NodeRegistration) => {
    const current = waitingForFocus.has(node.id);
    if (!current) return;

    waitingForFocus.delete(node.id);
    focusNode(node.id);
  };

  const focusNode = (id: string) => {
    const node = nodes.get(id);
    if (!node) return;
    setFocusedId(id);
    for (const listener of focusChangeListeners) listener(id);
    node?.focus?.();

    let current: NodeRegistration | undefined = node;
    while (current) {
      current.focusWithin?.();
      current = nodes.get(current.parentId);
    }
  };

  const focusParent = () => {
    const current = focusedId();
    if (!current) return;
    const parentId = nodes.get(current)?.parentId;
    if (parentId) focusNode(parentId);
  };

  const createChangeListener = (callback: (id: string) => void) => {
    focusChangeListeners.add(callback);
    onCleanup(() => focusChangeListeners.delete(callback));
  };

  const value: ContextValue = {
    focusedId,
    nodes,
    register: (registration) => {
      createEffect(() => {
        const current = registration();
        nodes.set(current.id, current);
        focusIfWaiting(current);
        onCleanup(() => {
          if (nodes.get(current.id) === current) nodes.delete(current.id);
        });
      });
    },
    createChangeListener,
    focusWhenAvailable,
    focusNode,
    focusParent,
  };

  createEventListener(document.body, "keydown", (event) => {
    if (isInteractive(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    let id = focusedId();
    while (id) {
      const node = nodes.get(id);
      if (!node) break;
      const handled = node.onKeyDown?.(event);
      if (handled) {
        event.preventDefault();
        break;
      }
      id = node.parentId;
    }
  });

  return (
    <Context.Provider value={value}>
      <RootNodeProvider>{props.children}</RootNodeProvider>
      <DebugFocusStack />
    </Context.Provider>
  );
}

interface NodeAutoRegistration extends Omit<NodeRegistration, "parentId"> {
  readonly parentId?: string;
}

export interface Node extends ContextValue {
  id: () => string;
  focused: () => boolean;
  focusWithin: (id?: string) => boolean;
  focusSelf: () => void;
}

function RootNodeProvider(props: ParentProps) {
  const fnode = createNode(() => ({
    id: "parent",
    parentId: "root",
  }));

  return <NodeProvider node={fnode}>{props.children}</NodeProvider>;
}

export function createNode(registration: (ctx: ContextValue) => NodeAutoRegistration): Node {
  const ctx = use();
  const fparent = useContext(NodeContext);

  const resolved = createMemo(() => {
    const current = registration(ctx);
    const parentId = current.parentId ?? fparent?.().id();
    if (!parentId) throw new Error("Expected parentId.");
    return { ...current, parentId };
  });

  ctx.register(resolved);

  const focusWithin = (_targetId?: string) => {
    const targetId = _targetId ?? resolved().id;
    let focusedId = ctx.focusedId();

    while (focusedId !== null) {
      if (focusedId === targetId) return true;

      const node = ctx.nodes.get(focusedId);
      if (!node) return false;
      focusedId = node.parentId;
    }

    return false;
  };

  const focused = () => ctx.focusedId() === resolved().id;
  const focusSelf = () => ctx.focusNode(id());
  const id = () => resolved().id;

  return { ...ctx, id, focused, focusSelf, focusWithin };
}

export function NodeProvider(props: ParentProps<{ node: Node }>) {
  return <NodeContext.Provider value={() => props.node}>{props.children}</NodeContext.Provider>;
}

export function useNode() {
  const node = useContext(NodeContext);
  if (!node) throw new Error("Expected focus node.");
  return node;
}

export const id = (paneId: string) => ({
  pane: () => `pane:${paneId}`,
  note: (id: string) => `pane:${paneId}:note:${id}`,
  editor: (id: string) => `pane:${paneId}:note:${id}:editor`,
});

export function useId() {
  const pane = PaneCtx.use();

  const inner = () => id(pane.pane().paneId);

  return {
    pane: () => inner().pane(),
    note: (id: string) => inner().note(id),
    editor: (id: string) => inner().editor(id),
  };
}

function isInteractive(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return !!target.closest("input, select, textarea, [role='dialog'], [contenteditable='true']");
}

function DebugFocusStack(): JSX.Element {
  const ctx = use();
  const stack = createMemo(() => {
    const stack: Array<string> = [];
    let id = ctx.focusedId();

    while (id) {
      stack.unshift(id);
      const node = ctx.nodes.get(id);
      if (!node) break;
      id = node.parentId;
    }

    return stack;
  });

  return (
    <div class="fixed left-2 bottom-8 z-50 max-w-96 rounded bg-black/80 p-2 font-mono text-[10px] text-white shadow-lg pointer-events-none">
      <div class="mb-1 text-white/60">focus</div>
      {stack().length === 0 ? (
        <div class="text-white/40">none</div>
      ) : (
        <ol class="space-y-0.5">
          {stack().map((id) => (
            <li class="truncate">{id}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

export * as Focus from "./focus";
