import {
  createContext,
  createMemo,
  createSignal,
  untrack,
  useContext,
  type Accessor,
  type JSX,
} from "solid-js";
import { VList, type VListHandle } from "virtua/solid";

/** The enclosing row's state and actions. */
export interface RowContext {
  /** Newly mounted rows are hidden until Virtua measures them. */
  readonly ready: Accessor<boolean>;
  /** Whether any part of this row is inside the viewport. */
  readonly visible: () => boolean;
  /** Scroll this row into view: nearest edge, or the start of a tall row. */
  readonly reveal: () => void;
}

const RowContext = createContext<RowContext>();

/** Keep requested rows mounted; Virtua owns their DOM, measurement and scrolling. */
export function Root<Item, Key>(props: {
  data: readonly Item[];
  key: (item: Item) => Key;
  retained: readonly Key[];
  children: (item: Item) => JSX.Element;
}) {
  let list: VListHandle | undefined;
  const [scrollIndex, setScrollIndex] = createSignal(0);

  // Resolve against rendered data so insertions and sorting cannot stale an index.
  const indexes = createMemo(
    () => new Map(props.data.map((item, index) => [props.key(item), index])),
  );

  const retained = createMemo(() => {
    const centers = [
      scrollIndex(),
      ...props.retained.flatMap((key) => {
        const index = indexes().get(key);

        return index === undefined ? [] : [index];
      }),
    ];

    const mounted = new Set<number>();

    // Policy from team-reflect/reflect-open, apps/desktop/src/components/
    // daily-stream.tsx, master fetched 2026-10-01 (Virtua ^0.51.0).
    // Adapted to our Virtua 0.48.8/Solid list: resolve keys from current data,
    // preserve the 1200px buffer, and omit shift for arbitrary list mutations.
    for (const center of centers) {
      for (
        let index = Math.max(0, center - 3);
        index <= Math.min(props.data.length - 1, center + 3);
        index++
      ) {
        mounted.add(index);
      }
    }

    return [...mounted].sort((a, b) => a - b);
  });

  const Row = (item: ItemProps) => {
    // Virtua keys this component by the data item; its index may change later.
    const row = untrack(() => props.data[item.index]!);
    const key = props.key(row);

    const context: RowContext = {
      ready: () => item.style.visibility !== "hidden",
      visible() {
        const index = indexes().get(key);

        if (index === undefined || !list) return false;

        const top = list.getItemOffset(index) - list.scrollOffset;

        return top < list.viewportSize && top + list.getItemSize(index) > 0;
      },
      reveal() {
        // Resolve at call time: insertions may have moved this row.
        const index = indexes().get(key);

        if (index === undefined || !list) return;

        // `nearest` would show a tall row's end when moving down; show its start.
        const tall = list.getItemSize(index) > list.viewportSize;
        list.scrollToIndex(index, { align: tall ? "start" : "nearest" });
      },
    };

    return (
      <div ref={item.ref} style={item.style}>
        <RowContext.Provider value={context}>{props.children(row)}</RowContext.Provider>
      </div>
    );
  };

  return (
    <VList
      ref={(value) => {
        list = value;
      }}
      data={props.data}
      keepMounted={retained()}
      itemSize={220}
      bufferSize={1200}
      item={Row}
      onScroll={(offset) => {
        const index = list?.findItemIndex(offset);

        if (index !== undefined) setScrollIndex(index);
      }}
    >
      {() => null}
    </VList>
  );
}

export function useRow(): RowContext {
  const context = useContext(RowContext);

  if (!context) throw new Error("useRow requires a VirtualList row");

  return context;
}

type ItemProps = {
  index: number;
  style: JSX.CSSProperties;
  ref: (element: HTMLDivElement) => void;
};

export * as VirtualList from "./virtual-list";
