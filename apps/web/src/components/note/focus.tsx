import { mergeRefs } from "@solid-primitives/refs";
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
  type ComponentProps,
  type ValidComponent,
  splitProps,
} from "solid-js";
import { Dynamic } from "solid-js/web";
import { createEventListener } from "@solid-primitives/event-listener";
import { createSequenceMatcher, isModifierKey, type Hotkey } from "@tanstack/hotkeys";
import { Data, Equal, MutableHashMap as MHS, MutableHashSet, Option } from "effect";
import { PaneCtx } from "../../lib/note/pane.ctx";
import type { Setter } from "solid-js";

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

export type ShortcutHandler = (event: KeyboardEvent) => boolean | undefined | void;

export type ShortcutBindingInput = {
  readonly key: ReadonlyArray<ReadonlyArray<Hotkey>>;
  readonly enabled?: () => boolean;
  readonly handler: ShortcutHandler;
  readonly preventDefault?: boolean;
  readonly stopPropagation?: boolean;
  readonly allowRepeat?: boolean;
};

type SequenceMatcher = ReturnType<typeof createSequenceMatcher>;

interface ShortcutBinding extends ShortcutBindingInput {
  readonly matchers: ReadonlyArray<SequenceMatcher>;
}

export type KeybindingHandler = (event: KeyboardEvent) => boolean | undefined;

type NodeRegistration = {
  readonly id: FocusId;
  readonly parentId: FocusId;
  readonly onFocus?: () => void;
  readonly onFocusWithin?: () => void;
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
    node.value.onFocus?.();

    for (const node of nodeAncestry(nodes, id)) node.onFocusWithin?.();
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
    if (isInteractive(event.target)) return;

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
      {/*<DebugFocusStack />*/}
    </Context.Provider>
  );
}

function RootNodeProvider(props: ParentProps) {
  const fnode = createNode(() => ({
    id: new RootNodeFocusId(),
    parentId: new RootFocusId(),
  }));

  return <NodeProvider node={fnode}>{props.children}</NodeProvider>;
}

interface NodeAutoRegistration {
  readonly id: FocusId;
  readonly parentId?: FocusId;
  readonly syncFocus?: (element: HTMLElement) => void;
  readonly syncFocusWithin?: (element: HTMLElement) => void;
  readonly onFocus?: () => void;
  readonly onFocusWithin?: () => void;
  readonly onKeyDown?: KeybindingHandler;
}

export interface Node extends ContextValue {
  id: () => FocusId;
  focused: () => boolean;
  focusWithin: (id?: FocusId) => boolean;
  focusSelf: () => void;
  registerShortcuts: (shortcuts: ReadonlyArray<ShortcutBindingInput>) => void;
  element: Accessor<HTMLElement | undefined>;
  setElement: Setter<HTMLElement | undefined>;
}

export function createNode(registration: (ctx: ContextValue) => NodeAutoRegistration): Node {
  const ctx = use();
  const fparent = useContext(NodeContext);

  const resolved = createMemo(() => registration(ctx));
  const [element, setElement] = createSignal<HTMLElement>();

  const id = () => resolved().id;

  const focused = () => {
    const current = ctx.focusedId();
    return current !== null && Equal.equals(current, id());
  };

  const focusWithin = (_targetId?: FocusId) => {
    const targetId = _targetId ?? id();
    return nodeAncestry(ctx.nodes, ctx.focusedId()).some((node) => Equal.equals(node.id, targetId));
  };

  const focusSelf = () => ctx.focusNode(id());

  const shortcutSets = new Set<ReadonlyArray<ShortcutBinding>>();

  const registerShortcuts = (inputs: ReadonlyArray<ShortcutBindingInput>) => {
    const shortcuts = inputs.map((input): ShortcutBinding => ({
      ...input,
      matchers: input.key.map((steps) => createSequenceMatcher([...steps])),
    }));
    shortcutSets.add(shortcuts);
    onCleanup(() => shortcutSets.delete(shortcuts));
  };

  const onKeyDown = (event: KeyboardEvent) => {
    // Modifier-only events neither advance nor reset a sequence, so chained
    // modifier chords (e.g. "Shift+R" then "Shift+T") keep working. The matcher
    // alone would reset on a lone modifier, so we filter those here.
    if (isModifierKey(event.key)) return false;

    for (const shortcuts of shortcutSets) {
      for (const shortcut of shortcuts) {
        if (!shortcut.allowRepeat && event.repeat) continue;
        if (shortcut.enabled && !shortcut.enabled()) continue;

        for (const matcher of shortcut.matchers) {
          if (matcher.match(event)) {
            if (fireShortcut(shortcut, event)) return true;
          }
        }
      }
    }

    if (resolved().onKeyDown?.(event)) return true;

    return false;
  };

  ctx.register(() => {
    const current = resolved();
    const parentId = current.parentId ?? fparent?.().id();
    if (!parentId) throw new Error("Expected parentId.");
    return { ...current, parentId, onKeyDown };
  });

  createEffect(() => {
    const current = element();
    if (!focused() || !current || document.activeElement === current) return;
    resolved().syncFocus?.(current);
  });

  createEffect(() => {
    const current = element();
    if (!focusWithin() || !current) return;
    resolved().syncFocusWithin?.(current);
  });

  return {
    ...ctx,
    id,
    focused,
    focusWithin,
    focusSelf,
    registerShortcuts,
    element,
    setElement,
  };
}

export function NodeProvider(props: ParentProps<{ node: Node }>) {
  return <NodeContext.Provider value={() => props.node}>{props.children}</NodeContext.Provider>;
}

export function useNode() {
  const node = useContext(NodeContext);
  if (!node) throw new Error("Expected focus node.");
  return node();
}

export type ElementProps<T extends ValidComponent = "div"> = ComponentProps<T> & {
  readonly as?: T;
};

export function Element<T extends ValidComponent = "div">(props: ElementProps<T>) {
  const fnode = useNode();
  const [local, rest] = splitProps(props as ElementProps, ["as", "ref", "tabIndex"]);

  return (
    <Dynamic
      component={local.as ?? "div"}
      ref={mergeRefs(fnode.setElement, local.ref)}
      tabIndex={local.tabIndex ?? -1}
      {...rest}
    />
  );
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

function fireShortcut(shortcut: ShortcutBindingInput, event: KeyboardEvent): boolean {
  const handled = shortcut.handler(event) === true;
  if (!handled) return false;

  if (shortcut.preventDefault !== false) event.preventDefault();
  if (shortcut.stopPropagation) event.stopPropagation();

  return true;
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

export function DebugFocusStack(): JSX.Element {
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
