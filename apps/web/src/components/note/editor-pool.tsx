import { Data, Deferred, Effect, RcMap, Scope } from "effect";
import {
  createContext,
  createRoot,
  createEffect,
  createSignal,
  untrack,
  runWithOwner,
  useContext,
  type Accessor,
  type Owner,
  type ParentProps,
} from "solid-js";
import type { JSX } from "@solidjs/web";
import Editor, { BootState } from "../../editor";
import type { NoteSchema } from "../../lib/note.schema";

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
  readonly noteId: NoteSchema.Id;
  readonly message: string;
}> {}

export type Slot = {
  readonly container: HTMLDivElement;
  readonly bootState: Accessor<BootState>;
  readonly ready: Effect.Effect<void, EditorBootError>;
  readonly setAttached: (attached: boolean) => void;
};

export type Pool = {
  readonly get: (noteId: NoteSchema.Id) => Effect.Effect<Slot, never, Scope.Scope>;
  readonly preload: (
    noteIds: ReadonlyArray<NoteSchema.Id>,
  ) => Effect.Effect<void, EditorBootError, Scope.Scope>;
};

export const make = Effect.fn("EditorPool.make")(function* (owner: Owner | null) {
  // Slots are created under the pane's owner so pooled editors keep its contexts
  // (graph runtime, atom registry, NoteLinkScope, router).
  const slots = yield* RcMap.make({
    idleTimeToLive: SLOT_IDLE_TTL,
    lookup: (noteId: NoteSchema.Id) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          if (!owner) throw new Error("EditorPool requires a Solid owner");

          return runWithOwner(owner, () => createSlot(noteId))!;
        }),
        (slot) => Effect.sync(() => slot.dispose()),
      ),
  });

  const get = (noteId: NoteSchema.Id): Effect.Effect<Slot, never, Scope.Scope> =>
    RcMap.get(slots, noteId);

  const preload = Effect.fn("EditorPool.preload")(function* (
    noteIds: ReadonlyArray<NoteSchema.Id>,
  ) {
    yield* Effect.forEach(noteIds, (noteId) => Effect.flatMap(get(noteId), (slot) => slot.ready), {
      concurrency: PRELOAD_CONCURRENCY,
      discard: true,
    });
  });

  return { get, preload } satisfies Pool;
});

const Context = createContext<Pool | null>(null);

export function Provider(props: ParentProps<{ pool: Pool }>): JSX.Element {
  // A pane's pool lives as long as the pane.
  return <Context value={untrack(() => props.pool)}>{props.children}</Context>;
}

export function use(): Pool {
  const pool = useContext(Context);

  if (!pool) throw new Error("Must use inside EditorPool.Provider");

  return pool;
}

type PooledSlot = Slot & {
  readonly dispose: () => void;
};

function createSlot(noteId: NoteSchema.Id): PooledSlot {
  const ready = Deferred.makeUnsafe<void, EditorBootError>();

  return createRoot((dispose) => {
    let editorBootState: Accessor<BootState> = () => BootState.Loading();
    const bootState = () => editorBootState();

    // Rows detach from their cleanup on unmount, which runs in an owned scope.
    const [attached, setAttached] = createSignal(false, { ownedWrite: true });

    // SAFETY: Solid's DOM JSX transform returns the intrinsic `div` element synchronously;
    // its public JSX.Element type is broader than the generated runtime value.
    const container = (
      <div>
        <Editor
          noteId={noteId}
          attached={attached()}
          onBootState={(state) => (editorBootState = state)}
        />
      </div>
    ) as HTMLDivElement;

    createEffect(bootState, (state) => {
      BootState.$match(state, {
        Loading: () => undefined,
        Ready: () => Effect.runSync(Deferred.succeed(ready, undefined)),
        Error: ({ message }) =>
          Effect.runSync(Deferred.fail(ready, new EditorBootError({ noteId, message }))),
      });
    });

    return {
      container,
      bootState,
      ready: Deferred.await(ready),
      setAttached,
      dispose,
    } satisfies PooledSlot;
  });
}

export * as EditorPool from "./editor-pool";
