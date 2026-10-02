// Ported from @prosekit/solid 0.6.2 (dist/prosekit-solid.js) and
// @prosemirror-adapter/solid 0.4.6 (src/nodeView) for prosekit 0.16.3.
// Copied because neither package supports Solid 2: they use `solid-js/h`,
// `solid-js/web` and `Context.Provider`.
// Modifications: only the APIs we use are kept (ProseKit, useEditor and node
// views). Each node view renders into its own root under the ProseKit owner
// and is disposed by ProseMirror's `destroy`, replacing the adapter's portal map.
import { CoreNodeView, type CoreNodeViewUserOptions } from "@prosemirror-adapter/core";
import {
  ProseKitError,
  defineMountHandler,
  defineNodeViewComponent,
  defineNodeViewFactory,
  defineUpdateHandler,
  union,
  type Editor,
  type Extension,
} from "prosekit/core";
import type { Attrs, Node } from "prosekit/pm/model";
import type {
  Decoration,
  DecorationSource,
  EditorView,
  NodeViewConstructor,
} from "prosekit/pm/view";
import {
  createComponent,
  createContext,
  createEffect,
  createRoot,
  createSignal,
  getOwner,
  runWithOwner,
  useContext,
  type Component,
  type Owner,
  type ParentProps,
} from "solid-js";
import { insert } from "@solidjs/web";

export type ProseKitProps = ParentProps<{ editor: Editor }>;

export interface SolidNodeViewProps {
  contentRef: (element: HTMLElement | null) => void;
  view: EditorView;
  getPos: () => number | undefined;
  setAttrs: (attrs: Attrs) => void;
  node: Node;
  selected: boolean;
  decorations: readonly Decoration[];
  innerDecorations: DecorationSource;
}

export type SolidNodeViewComponent = Component<SolidNodeViewProps>;

export interface SolidNodeViewOptions extends CoreNodeViewUserOptions<SolidNodeViewComponent> {
  name: string;
}

export const EditorContext = createContext<Editor | null>(null);

/** The root component for a ProseKit editor. */
export function ProseKit(props: ProseKitProps) {
  const owner = getOwner();

  createEffect(
    () => props.editor,
    (editor) => editor.use(defineSolidNodeViewFactory(owner)),
  );

  return <EditorContext value={props.editor}>{props.children}</EditorContext>;
}

/** Retrieves the editor instance from the nearest ProseKit component. */
export function useEditor<E extends Extension = any>(options?: {
  update?: boolean;
}): () => Editor<E> {
  const editor = useContext(EditorContext);

  if (!editor) throw new ProseKitError("useEditor must be used within the ProseKit component");

  const [depend, forceUpdate] = createSignal(undefined, { equals: false, ownedWrite: true });

  if (options?.update) {
    createEffect(
      () => editor,
      (editor) => {
        const update = () => forceUpdate(undefined);

        return editor.use(union(defineMountHandler(update), defineUpdateHandler(update)));
      },
    );
  }

  return () => {
    depend();

    // SAFETY: E only narrows the extension type of the editor ProseKit provides.
    return editor as Editor<E>;
  };
}

/** Defines a node view using a Solid component. */
export function defineSolidNodeView(options: SolidNodeViewOptions): Extension {
  const { name, ...args } = options;

  return defineNodeViewComponent({ group: "solid", name, args });
}

type NodeViewUserOptions = CoreNodeViewUserOptions<SolidNodeViewComponent>;

function defineSolidNodeViewFactory(owner: Owner | null) {
  return defineNodeViewFactory<NodeViewUserOptions>({
    group: "solid",
    factory:
      (options): NodeViewConstructor =>
      (node, view, getPos, decorations, innerDecorations) => {
        const nodeView: SolidNodeView = new SolidNodeView({
          node,
          view,
          getPos,
          decorations,
          innerDecorations,
          options: {
            ...options,
            onUpdate() {
              options.onUpdate?.();
              nodeView.sync();
            },
            selectNode() {
              options.selectNode?.();
              nodeView.sync();
            },
            deselectNode() {
              options.deselectNode?.();
              nodeView.sync();
            },
            destroy() {
              options.destroy?.();
              nodeView.dispose();
            },
          },
        });

        nodeView.mount(owner);

        return nodeView;
      },
  });
}

class SolidNodeView extends CoreNodeView<SolidNodeViewComponent> {
  // ProseMirror calls these hooks outside Solid, sometimes during owned updates.
  readonly #state = createSignal(this.#snapshot(), { ownedWrite: true });
  #dispose = () => {};

  mount(owner: Owner | null) {
    const [state] = this.#state;

    const props: SolidNodeViewProps = {
      contentRef: (element) => {
        if (element && this.contentDOM && element.firstChild !== this.contentDOM) {
          element.appendChild(this.contentDOM);
        }
      },
      view: this.view,
      getPos: this.getPos,
      setAttrs: this.setAttrs,
      get node() {
        return state().node;
      },
      get selected() {
        return state().selected;
      },
      get decorations() {
        return state().decorations;
      },
      get innerDecorations() {
        return state().innerDecorations;
      },
    };

    const component = this.component;

    this.#dispose = runWithOwner(owner, () =>
      createRoot((dispose) => {
        insert(this.dom, () => createComponent(component, props));

        return dispose;
      }),
    );
  }

  sync() {
    this.#state[1](this.#snapshot());
  }

  dispose() {
    this.#dispose();
  }

  #snapshot() {
    return {
      node: this.node,
      selected: this.selected,
      decorations: this.decorations,
      innerDecorations: this.innerDecorations,
    };
  }
}
