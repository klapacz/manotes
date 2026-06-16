import { Data, Deferred, Effect, RcMap, Scope } from "effect";
import {
  createContext,
  createRoot,
  createSignal,
  runWithOwner,
  useContext,
  type Accessor,
  type JSX,
  type Owner,
  type ParentProps,
} from "solid-js";
import Editor, { BootState } from "../../editor";
import { Focus } from "./focus";

// Pool of persistent editors (corvu createPersistent-style: render once into a
// detached root that outlives row unmounts, reattach the resolved DOM on
// remount — https://corvu.dev/docs/utilities/persistent/). Scroll-back
// revisits reuse the same ProseMirror DOM instead of rebooting, so virtua
// measures the final row height immediately. The pool is per pane — a DOM node
// can't be attached in two places. Slots are an Effect `RcMap`: the acquiring
// atom's scope holds the reference, and the slot's Solid root is disposed once
// the slot has been idle past the TTL.

const SLOT_IDLE_TTL = "7 seconds";
const PRELOAD_CONCURRENCY = 10;

export class EditorBootError extends Data.TaggedError("EditorBootError")<{
  readonly noteId: string;
  readonly message: string;
}> {}

export type Slot = {
  readonly container: HTMLDivElement;
  readonly bootState: Accessor<BootState>;
  readonly ready: Effect.Effect<void, EditorBootError>;
  readonly setFocusParent: (node: Focus.Node | undefined) => void;
};

export type Pool = {
  readonly get: (noteId: string) => Effect.Effect<Slot, never, Scope.Scope>;
  readonly preload: (
    noteIds: ReadonlyArray<string>,
  ) => Effect.Effect<void, EditorBootError, Scope.Scope>;
};

export const make = Effect.fn("EditorPool.make")(function* (owner: Owner | null) {
  // Slots are created under the pane's owner so pooled editors keep its contexts
  // (graph runtime, atom registry, NoteLinkScope, router).
  const slots = yield* RcMap.make({
    idleTimeToLive: SLOT_IDLE_TTL,
    lookup: (noteId: string) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (!owner) throw new Error("EditorPool requires a Solid owner");
          return runWithOwner(owner, () => createSlot(noteId))!;
        }),
        (slot) => Effect.sync(() => slot.dispose()),
      ),
  });

  const get = (noteId: string): Effect.Effect<Slot, never, Scope.Scope> => RcMap.get(slots, noteId);

  const preload = Effect.fn("EditorPool.preload")(function* (noteIds: ReadonlyArray<string>) {
    yield* Effect.forEach(noteIds, (noteId) => Effect.flatMap(get(noteId), (slot) => slot.ready), {
      concurrency: PRELOAD_CONCURRENCY,
      discard: true,
    });
  });

  return { get, preload } satisfies Pool;
});

const Context = createContext<Pool | null>(null);

export function Provider(props: ParentProps<{ pool: Pool }>): JSX.Element {
  return <Context.Provider value={props.pool}>{props.children}</Context.Provider>;
}

export function use(): Pool {
  const pool = useContext(Context);
  if (!pool) throw new Error("Must use inside EditorPool.Provider");
  return pool;
}

type PooledSlot = Slot & {
  readonly dispose: () => void;
};

function createSlot(noteId: string): PooledSlot {
  const ready = Deferred.makeUnsafe<void, EditorBootError>();

  return createRoot((dispose) => {
    const [bootState, setBootState] = createSignal<BootState>(BootState.Loading());

    const setBootStateReady = (state: BootState) => {
      setBootState(state);

      switch (state._tag) {
        case "Ready": {
          Effect.runSync(Deferred.succeed(ready, undefined));
          break;
        }
        case "Error": {
          Effect.runSync(
            Deferred.fail(ready, new EditorBootError({ noteId, message: state.message })),
          );
          break;
        }
      }
    };

    const fnode = Focus.useNode();
    const [focusParent, setFocusParent] = createSignal<Focus.Node>();

    const container = (
      <div>
        <Focus.NodeProvider node={focusParent() ?? fnode}>
          <Editor noteId={noteId} onBootStateChange={setBootStateReady} />
        </Focus.NodeProvider>
      </div>
    ) as HTMLDivElement;

    return {
      container,
      bootState,
      ready: Deferred.await(ready),
      setFocusParent,
      dispose,
    } satisfies PooledSlot;
  });
}

export * as EditorPool from "./editor-pool";
