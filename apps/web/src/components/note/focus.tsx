import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  getOwner,
  onCleanup,
  useContext,
  type Accessor,
  type JSX,
  type ParentProps,
} from "solid-js";
import { createEventListener } from "@solid-primitives/event-listener";
import { Data, Equal, MutableHashMap as MHS, MutableHashSet, Option } from "effect";
import { PaneCtx } from "../../lib/note/pane.ctx";

export type FocusId =
  | RootFocusId
  | RootNodeFocusId
  | PaneGridFocusId
  | PaneFocusId
  | NoteFocusId
  | EditorFocusId;

class RootFocusId extends Data.TaggedClass("RootFocusId")<{}> {}

class RootNodeFocusId extends Data.TaggedClass("RootNodeFocusId")<{}> {}

export class PaneGridFocusId extends Data.TaggedClass("PaneGridFocusId")<{}> {}

class PaneFocusId extends Data.TaggedClass("PaneFocusId")<{
  readonly paneId: string;
}> {}

class NoteFocusId extends Data.TaggedClass("NoteFocusId")<{
  readonly paneId: string;
  readonly noteId: string;
}> {}

class EditorFocusId extends Data.TaggedClass("EditorFocusId")<{
  readonly paneId: string;
  readonly noteId: string;
}> {}

export type KeybindingHandler = (event: KeyboardEvent) => boolean | undefined;

type NodeRegistration = {
  readonly id: FocusId;
  readonly parentId: FocusId;
  readonly focus?: () => void;
  readonly focusWithin?: () => void;
  readonly onKeyDown?: KeybindingHandler;
};

export type ContextValue = {
  readonly focusedId: Accessor<FocusId | null>;
  readonly register: (registration: () => NodeRegistration) => void;
  readonly createChangeListener: (callback: (id: FocusId) => void) => void;
  readonly focusWhenAvailable: (id: FocusId) => void;
  readonly focusNode: (id: FocusId) => void;
  readonly focusParent: () => void;
  readonly focusedStack: () => Array<FocusId>;
  readonly nodes: MHS.MutableHashMap<FocusId, NodeRegistration>;
};

const Context = createContext<ContextValue>();
export const NodeContext = createContext<Accessor<Node>>();

export function use(): ContextValue {
  const ctx = useContext(Context);
  if (!ctx) throw new Error("PaneStreamFocus.use must be used within Provider");
  return ctx;
}

export function Provider(props: ParentProps): JSX.Element {
  const [focusedId, setFocusedId] = createSignal<FocusId | null>(null);
  const nodes = MHS.empty<FocusId, NodeRegistration>();
  const waitingForFocus = MutableHashSet.empty<FocusId>();
  const focusChangeListeners = new Set<(id: FocusId) => void>();

  const focusWhenAvailable = (id: FocusId) => {
    if (Option.isSome(MHS.get(nodes, id))) return focusNode(id);
    MutableHashSet.add(waitingForFocus, id);
  };

  const focusIfWaiting = (node: NodeRegistration) => {
    const current = MutableHashSet.has(waitingForFocus, node.id);
    if (!current) return;

    MutableHashSet.remove(waitingForFocus, node.id);
    focusNode(node.id);
  };

  const focusNode = (id: FocusId) => {
    const node = MHS.get(nodes, id);
    if (Option.isNone(node)) return;

    setFocusedId(id);
    for (const listener of focusChangeListeners) listener(id);
    node.value.focus?.();

    for (const node of nodeAncestry(nodes, id)) node.focusWithin?.();
  };

  const focusParent = () => {
    const current = focusedId();
    if (!current) return;

    const node = MHS.get(nodes, current);
    if (Option.isSome(node)) focusNode(node.value.parentId);
  };

  const createChangeListener = (callback: (id: FocusId) => void) => {
    focusChangeListeners.add(callback);
    onCleanup(() => focusChangeListeners.delete(callback));
  };

  const focusedStack = () => stackFromAncestry(nodeAncestry(nodes, focusedId()));

  const focusedIdIs = (id: FocusId) => {
    const current = focusedId();
    return current !== null && Equal.equals(current, id);
  };

  const value: ContextValue = {
    focusedId,
    nodes,
    register: (registration) => {
      createEffect(() => {
        const current = registration();
        MHS.set(nodes, current.id, current);
        focusIfWaiting(current);
        onCleanup(() => {
          const node = MHS.get(nodes, current.id);
          if (Option.isSome(node) && node.value === current) {
            const shouldFocusParent = focusedIdIs(current.id);
            MHS.remove(nodes, current.id);

            if (shouldFocusParent) {
              queueMicrotask(() => {
                if (focusedIdIs(current.id) && Option.isNone(MHS.get(nodes, current.id))) {
                  focusNode(current.parentId);
                }
              });
            }
          }
        });
      });
    },
    createChangeListener,
    focusWhenAvailable,
    focusNode,
    focusParent,
    focusedStack,
  };

  createEventListener(document.body, "keydown", (event) => {
    if (isInteractive(event.target) || event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }

    const current = focusedId();
    if (!current) return;

    for (const node of nodeAncestry(nodes, current)) {
      const handled = node.onKeyDown?.(event);
      if (!handled) continue;

      event.preventDefault();
      break;
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
  readonly parentId?: FocusId;
}

export interface Node extends ContextValue {
  id: () => FocusId;
  focused: () => boolean;
  focusWithin: (id?: FocusId) => boolean;
  focusSelf: () => void;
  registerKeybindings: (handler: KeybindingHandler) => () => void;
}

export class NodeResolution implements Node {
  readonly focusedId: ContextValue["focusedId"];
  readonly register: ContextValue["register"];
  readonly createChangeListener: ContextValue["createChangeListener"];
  readonly focusWhenAvailable: ContextValue["focusWhenAvailable"];
  readonly focusNode: ContextValue["focusNode"];
  readonly focusParent: ContextValue["focusParent"];
  readonly focusedStack: ContextValue["focusedStack"];
  readonly #ctx: ContextValue;
  readonly #resolved: Accessor<NodeRegistration>;
  readonly #keybindings = new Set<KeybindingHandler>();

  constructor(ctx: ContextValue, resolved: Accessor<NodeRegistration>) {
    this.#ctx = ctx;
    this.#resolved = resolved;
    this.focusedId = ctx.focusedId;
    this.register = ctx.register;
    this.createChangeListener = ctx.createChangeListener;
    this.focusWhenAvailable = ctx.focusWhenAvailable;
    this.focusNode = ctx.focusNode;
    this.focusParent = ctx.focusParent;
    this.focusedStack = ctx.focusedStack;
  }

  get nodes() {
    return this.#ctx.nodes;
  }

  readonly id = () => this.#resolved().id;

  readonly focused = () => {
    const current = this.#ctx.focusedId();
    return current !== null && Equal.equals(current, this.id());
  };

  readonly focusWithin = (_targetId?: FocusId) => {
    const targetId = _targetId ?? this.id();
    return nodeAncestry(this.#ctx.nodes, this.#ctx.focusedId()).some((node) =>
      Equal.equals(node.id, targetId),
    );
  };

  readonly focusSelf = () => this.#ctx.focusNode(this.id());

  readonly registerKeybindings = (handler: KeybindingHandler) => {
    this.#keybindings.add(handler);
    const cleanup = () => this.#keybindings.delete(handler);
    if (getOwner()) onCleanup(cleanup);
    return cleanup;
  };

  readonly onKeyDown = (event: KeyboardEvent) => {
    if (this.#resolved().onKeyDown?.(event)) return true;

    for (const handler of this.#keybindings) {
      if (handler(event)) return true;
    }

    return false;
  };
}

function RootNodeProvider(props: ParentProps) {
  const fnode = createNode(() => ({
    id: new RootNodeFocusId(),
    parentId: new RootFocusId(),
  }));

  return <NodeProvider node={fnode}>{props.children}</NodeProvider>;
}

export function createNode(
  registration: (ctx: ContextValue) => NodeAutoRegistration,
): NodeResolution {
  const ctx = use();
  const fparent = useContext(NodeContext);

  const resolved = createMemo(() => {
    const current = registration(ctx);
    const parentId = current.parentId ?? fparent?.().id();
    if (!parentId) throw new Error("Expected parentId.");
    return { ...current, parentId };
  });

  const node = new NodeResolution(ctx, resolved);
  ctx.register(() => ({ ...resolved(), onKeyDown: node.onKeyDown }));

  return node;
}

export function NodeProvider(props: ParentProps<{ node: Node }>) {
  return <NodeContext.Provider value={() => props.node}>{props.children}</NodeContext.Provider>;
}

export function useNode() {
  const node = useContext(NodeContext);
  if (!node) throw new Error("Expected focus node.");
  return node();
}

export const id = (paneId: string) => ({
  pane: () => new PaneFocusId({ paneId }),
  note: (noteId: string) => new NoteFocusId({ paneId, noteId }),
  editor: (noteId: string) => new EditorFocusId({ paneId, noteId }),
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

function formatId(id: FocusId): string {
  switch (id._tag) {
    case "RootFocusId":
      return "root";
    case "RootNodeFocusId":
      return "root-node";
    case "PaneGridFocusId":
      return "pane-grid";
    case "PaneFocusId":
      return `pane:${id.paneId}`;
    case "NoteFocusId":
      return `pane:${id.paneId}:note:${id.noteId}`;
    case "EditorFocusId":
      return `pane:${id.paneId}:note:${id.noteId}:editor`;
  }
}

function nodeAncestry(
  nodes: MHS.MutableHashMap<FocusId, NodeRegistration>,
  startId: FocusId | null,
): Array<NodeRegistration> {
  const result: Array<NodeRegistration> = [];
  let id = startId;

  while (id) {
    const node = MHS.get(nodes, id);
    if (Option.isNone(node)) break;

    result.push(node.value);
    id = node.value.parentId;
  }

  return result;
}

function stackFromAncestry(ancestry: Array<NodeRegistration>): Array<FocusId> {
  return ancestry.map((node) => node.id).reverse();
}

function DebugFocusStack(): JSX.Element {
  const ctx = use();
  const stack = createMemo(() => ctx.focusedStack());

  return (
    <div class="fixed left-2 bottom-8 z-50 max-w-96 rounded bg-black/80 p-2 font-mono text-[10px] text-white shadow-lg pointer-events-none">
      <div class="mb-1 text-white/60">focus</div>
      {stack().length === 0 ? (
        <div class="text-white/40">none</div>
      ) : (
        <ol class="space-y-0.5">
          {stack().map((id) => (
            <li class="truncate">{formatId(id)}</li>
          ))}
        </ol>
      )}
    </div>
  );
}

export * as Focus from "./focus";
