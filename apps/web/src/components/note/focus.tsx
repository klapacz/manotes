import { createEventListener } from "@solid-primitives/event-listener";
import { mergeRefs } from "@solid-primitives/refs";
import { Data } from "effect";
import {
  createContext,
  createEffect,
  createMemo,
  createSignal,
  onSettled,
  omit,
  useContext,
  type Accessor,
  type ParentProps,
  type Setter,
} from "solid-js";
import { type ComponentProps, type ValidComponent, Dynamic } from "@solidjs/web";
import { FocusDOM } from "../../lib/focus-dom";
import { Shortcuts } from "../../lib/shortcuts";
import type { NoteSchema } from "../../lib/note.schema";
import { PaneCtx } from "../../lib/note/pane.ctx";
import type { PaneSchema } from "../../lib/note/pane.schema";

export type FocusId = Data.TaggedEnum<{
  Pane: { readonly paneId: PaneSchema.Id };
  Note: { readonly paneId: PaneSchema.Id; readonly noteId: NoteSchema.Id };
  Editor: { readonly paneId: PaneSchema.Id; readonly noteId: NoteSchema.Id };
}>;

export const FocusId = Data.taggedEnum<FocusId>();

/** How a request scrolls its destination into view; omitted keeps the reading position. */
export interface RequestOptions {
  readonly reveal?: "always" | "if-hidden";
}

type DOM = ReturnType<typeof FocusDOM.create<FocusId, RequestOptions>>;

export interface ContextValue {
  activeId(): FocusId | null;
  pendingId(): FocusId | null;
  /** Where navigation resolves from: the pending request, else actual focus. */
  targetId(): FocusId | null;
  request(id: FocusId, options?: RequestOptions): void;
  /** Request the nearest target containing focus; false when there is none. */
  requestParent(): boolean;
}

interface ContextState extends ContextValue {
  readonly dom: DOM;
  readonly scopes: WeakMap<Element, Scope>;
  readonly highlightedElement: Accessor<Element | null>;
}

interface Options {
  readonly id?: FocusId;
  readonly enabled?: boolean;
  readonly focus?: (element: HTMLElement, options: RequestOptions | undefined) => void;
}

export interface Node {
  readonly id: Accessor<FocusId | undefined>;
  readonly element: Accessor<HTMLElement | undefined>;
  readonly setElement: Setter<HTMLElement | undefined>;
  highlighted(): boolean;
  highlightWithin(): boolean;
  registerShortcuts(bindings: readonly Shortcuts.Binding[]): void;
}

interface Scope extends Node {
  handleKeyDown(event: KeyboardEvent): boolean;
}

const Context = createContext<ContextState>();

const NodeContext = createContext<Node>();

export function Provider(props: ParentProps) {
  const dom = FocusDOM.create<FocusId, RequestOptions>();
  const scopes = new WeakMap<Element, Scope>();

  // Keep the canvas target highlighted while a button or portal owns native
  // focus. This is presentation memory only; commands always use actual focus.
  const highlightedElement = createMemo<Element | null>((previous = null) => {
    const element = dom.activeElement();

    return element && scopes.get(element)?.id() ? element : previous;
  });

  const isTarget = (target: EventTarget | null) =>
    target instanceof HTMLElement && !!scopes.get(target)?.id();

  const ancestry = (element: Element | null) => {
    const nodes: Scope[] = [];

    for (let current = element; current; current = current.parentElement) {
      const node = scopes.get(current);

      if (node) nodes.push(node);
    }

    return nodes;
  };

  const parentId = () =>
    ancestry(dom.activeElement()?.parentElement ?? null)
      .find((node) => node.id())
      ?.id();

  const value: ContextState = {
    dom,
    scopes,
    highlightedElement,
    activeId: dom.activeId,
    pendingId: dom.pendingId,
    targetId: () => dom.pendingId() ?? dom.activeId(),
    request: dom.request,
    requestParent: () => {
      const id = parentId();

      if (id) dom.request(id);

      return id !== undefined;
    },
  };

  // Focus that falls to the body left a canvas target because its element moved
  // or was removed. A moved element gets focus back; otherwise its pane is entered.
  createEventListener(document, "focusout", (event) => {
    const target = event.target;
    // Read before the browser observation updates after this event.
    const lost = dom.activeId();

    if (event.relatedTarget !== null || !(target instanceof HTMLElement) || !lost) return;

    queueMicrotask(() => {
      if (document.activeElement !== document.body) return;

      if (target.isConnected) target.focus({ preventScroll: true });
      else dom.request(FocusId.Pane({ paneId: lost.paneId }));
    });
  });

  // Browse commands replace the pending request themselves, after reading it.
  // Unhandled keys and manual pointer/scroll input cancel a deferred request.
  createEventListener(document, "pointerdown", dom.cancel, { capture: true });
  createEventListener(document, "wheel", dom.cancel, { capture: true, passive: true });
  createEventListener(document, "touchstart", dom.cancel, { capture: true, passive: true });
  createEventListener(document.body, "keydown", (event) => {
    if (event.defaultPrevented || event.isComposing) return;

    if (!Shortcuts.controlOwnsKey(event.target, event)) {
      for (const node of ancestry(dom.activeElement())) {
        if (node.handleKeyDown(event)) return;
      }

      // Escape leaves a local control, such as a button, for its focus target.
      if (event.key === "Escape" && !isTarget(event.target) && value.requestParent()) {
        event.preventDefault();

        return;
      }
    }

    dom.cancel();
  });

  return <Context value={value}>{props.children}</Context>;
}

export function use(): ContextValue {
  return useContextState();
}

/** Component scopes own commands; registering a scope never focuses it. */
export function createNode(options: () => Options): Node {
  const context = useContextState();
  const resolved = createMemo(options);
  const [element, setElement] = createSignal<HTMLElement>();
  const [mounted, setMounted] = createSignal(false);
  const shortcuts = Shortcuts.create();

  const node: Scope = {
    id: () => resolved().id,
    element,
    setElement,
    highlighted: () => !!element() && context.highlightedElement() === element(),
    highlightWithin: () => element()?.contains(context.highlightedElement()) ?? false,
    registerShortcuts: shortcuts.register,
    handleKeyDown: shortcuts.handle,
  };

  onSettled(() => {
    setMounted(true);
  });
  createEffect(
    () => ({ current: element(), options: resolved(), mounted: mounted() }),
    ({ current, options, mounted }) => {
      if (!mounted || !current) return;
      context.scopes.set(current, node);

      const unregister =
        options.id && options.enabled !== false
          ? context.dom.register({
              id: options.id,
              element: current,
              focus: options.focus ? (request) => options.focus!(current, request) : undefined,
            })
          : undefined;

      return () => {
        context.scopes.delete(current);
        unregister?.();
      };
    },
  );

  return node;
}

/** A note target: Enter edits the note, and its editor's Escape returns here. */
export function createNoteNode(
  noteId: Accessor<NoteSchema.Id>,
  options: () => Omit<Options, "id"> = () => ({}),
): Node {
  const context = useContextState();
  const ids = useId();
  const node = createNode(() => ({ ...options(), id: ids.note(noteId()) }));

  node.registerShortcuts([
    {
      key: [["Enter"]],
      handler: () => {
        context.request(ids.editor(noteId()), { reveal: "always" });

        return true;
      },
    },
  ]);

  return node;
}

export function NodeProvider(props: ParentProps<{ node: Node }>) {
  return <NodeContext value={props.node}>{props.children}</NodeContext>;
}

export function useNode(): Node {
  const node = useContext(NodeContext);

  if (!node) throw new Error("Expected focus scope");

  return node;
}

export function Element<T extends ValidComponent = "div">(props: ComponentProps<T> & { as?: T }) {
  const node = useNode();
  const local = props;
  const rest = omit(props, "as", "ref", "tabindex");

  return (
    <Dynamic
      component={local.as ?? "div"}
      ref={mergeRefs(node.setElement, local.ref)}
      tabindex={local.tabindex ?? -1}
      {...rest}
    />
  );
}

export const id = (paneId: PaneSchema.Id) => ({
  pane: () => FocusId.Pane({ paneId }),
  note: (noteId: NoteSchema.Id) => FocusId.Note({ paneId, noteId }),
  editor: (noteId: NoteSchema.Id) => FocusId.Editor({ paneId, noteId }),
});

export function noteIn(paneId: PaneSchema.Id, target: FocusId | null): NoteSchema.Id | undefined {
  return target && target.paneId === paneId && !FocusId.$is("Pane")(target)
    ? target.noteId
    : undefined;
}

export function useId() {
  const pane = PaneCtx.use();
  const ids = () => id(pane.pane().paneId);

  return {
    pane: () => ids().pane(),
    note: (noteId: NoteSchema.Id) => ids().note(noteId),
    editor: (noteId: NoteSchema.Id) => ids().editor(noteId),
  };
}

function useContextState(): ContextState {
  const context = useContext(Context);

  if (!context) throw new Error("Focus requires its Provider");

  return context;
}

export * as Focus from "./focus";
