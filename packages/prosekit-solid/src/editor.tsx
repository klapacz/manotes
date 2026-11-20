import {
  createContext,
  createMemo,
  createRenderEffect,
  createSignal,
  For,
  onCleanup,
  useContext,
  type Component,
} from "solid-js";
import { Portal, type JSX } from "@solidjs/web";
import {
  defineKeymap,
  defineMountHandler,
  defineNodeViewComponent,
  defineNodeViewFactory,
  defineUpdateHandler,
  union,
  withPriority,
  type Editor,
  type Extension,
  type Keymap,
  type Priority,
} from "prosekit/core";
import { CoreNodeView, type CoreNodeViewUserOptions } from "@prosemirror-adapter/core";

// Solid 2 contexts, effects and node-view portals replace the upstream Solid 1 bindings.
// Adapted from @prosekit/solid 0.8.3 dist/index.js and
// @prosemirror-adapter/solid 0.5.5 src/nodeView. Source hashes are in source-pins.json; both upstream MIT licenses are included.
export interface SolidNodeViewProps {
  contentRef: (element: HTMLElement | null) => void;
  view: CoreNodeView<unknown>["view"];
  getPos: CoreNodeView<unknown>["getPos"];
  setAttrs: CoreNodeView<unknown>["setAttrs"];
  node: CoreNodeView<unknown>["node"];
  selected: boolean;
  decorations: CoreNodeView<unknown>["decorations"];
  innerDecorations: CoreNodeView<unknown>["innerDecorations"];
}

export type SolidNodeViewComponent = Component<SolidNodeViewProps>;

type NodeOptions = CoreNodeViewUserOptions<Component<SolidNodeViewProps>>;

const Context = createContext<Editor | null>(null);

export function useEditorContext() {
  return useContext(Context);
}

export function defineSolidNodeView(options: NodeOptions & { name: string }): Extension {
  return defineNodeViewComponent({ group: "solid2", name: options.name, args: options });
}

class SolidNodeView extends CoreNodeView<Component<SolidNodeViewProps>> {
  readonly content = this.contentRef;
}

type Renderer = { view: SolidNodeView; props: SolidNodeViewProps };

export function ProseKit(props: { editor: Editor; children: JSX.Element }) {
  return (
    <Context value={props.editor}>
      <ViewRenderer editor={props.editor}>{props.children}</ViewRenderer>
    </Context>
  );
}

function ViewRenderer(props: { editor: Editor; children: JSX.Element }) {
  // ProseMirror creates/destroys views during mount and extension reconfiguration.
  const [renderers, setRenderers] = createSignal<Renderer[]>([], { ownedWrite: true });

  const factory = defineNodeViewFactory<NodeOptions>({
    group: "solid2",
    factory: (options) => {
      return (node, view, getPos, decorations, innerDecorations) => {
        const [revision, setRevision] = createSignal(0, { ownedWrite: true });
        const update = () => setRevision((value) => value + 1);

        const nodeView = new SolidNodeView({
          node,
          view,
          getPos,
          decorations,
          innerDecorations,
          options: {
            ...options,
            onUpdate: () => {
              options.onUpdate?.();
              update();
            },
            selectNode: () => {
              options.selectNode?.();
              update();
            },
            deselectNode: () => {
              options.deselectNode?.();
              update();
            },
            destroy: () => {
              options.destroy?.();
              setRenderers((items) => items.filter((item) => item.view !== nodeView));
            },
          },
        });

        const reactiveProps: SolidNodeViewProps = {
          contentRef: nodeView.content,
          view,
          getPos,
          setAttrs: nodeView.setAttrs,
          get node() {
            revision();

            return nodeView.node;
          },
          get selected() {
            revision();

            return nodeView.selected;
          },
          get decorations() {
            revision();

            return nodeView.decorations;
          },
          get innerDecorations() {
            revision();

            return nodeView.innerDecorations;
          },
        };

        setRenderers((items) => [...items, { view: nodeView, props: reactiveProps }]);

        return nodeView;
      };
    },
  });

  useExtension(() => factory, { editor: () => props.editor });
  onCleanup(() => setRenderers([]));

  return (
    <>
      {props.children}
      <For each={renderers()}>
        {(item) => {
          const Component = item.view.component;

          return (
            <Portal mount={item.view.dom}>
              <Component {...item.props} />
            </Portal>
          );
        }}
      </For>
    </>
  );
}

type Options = { editor?: () => Editor; priority?: Priority };

export function useExtension(extension: () => Extension | null, options?: Options) {
  const context = useEditorContext();
  createRenderEffect(
    () => {
      const editor = options?.editor?.() ?? context;
      const value = extension();

      if (!editor) throw new Error("useExtension requires ProseKit or an editor");

      return { editor, value };
    },
    ({ editor, value }) => {
      if (value) {
        return editor.use(options?.priority ? withPriority(value, options.priority) : value);
      }
    },
  );
}

export function useEditor<E extends Extension = Extension>(options?: { update?: boolean }) {
  // SAFETY: the provider retains the editor instance; E only restores its erased extension type.
  const editor = useEditorContext() as Editor<E> | null;

  if (!editor) throw new Error("useEditor requires ProseKit");

  if (!options?.update) return () => editor;

  const [revision, setRevision] = createSignal(0, { ownedWrite: true });

  const update = () => {
    setRevision((value) => value + 1);
  };

  useExtension(() => union(defineMountHandler(update), defineUpdateHandler(update)));

  return () => {
    revision();

    return editor;
  };
}

export function useEditorDerivedValue<E extends Extension, T>(derive: (editor: Editor<E>) => T) {
  const editor = useEditor<E>({ update: true });

  return createMemo(() => derive(editor()));
}

export function useKeymap(keymap: () => Keymap, options?: Options) {
  useExtension(() => defineKeymap(keymap()), options);
}
