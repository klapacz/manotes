import type { JSX } from "@solidjs/web";
import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { Option } from "effect";
import { Data, Deferred, Effect, Exit, RcMap, Scope } from "effect";
import {
  createContext,
  createRoot,
  createRenderEffect,
  createSignal,
  getOwner,
  onCleanup,
  runWithOwner,
  useContext,
  type Accessor,
  type Owner,
  type ParentProps,
} from "solid-js";
import { insert } from "@solidjs/web";
import Editor from "../../editor";
import { LiveDoc } from "../../lib/live-doc.service";
import { LiveDocAtom } from "../../lib/live-doc.atom";
import { Frame } from "../../lib/frame";
import type { RecordSchema } from "@manotes/shared/record.schema";

// Pool of persistent editors (corvu createPersistent-style: render once into a
// detached root that outlives row unmounts, reattach the resolved DOM on
// remount — https://corvu.dev/docs/utilities/persistent/). Scroll-back
// revisits reuse the same ProseMirror DOM instead of rebooting, so virtua
// measures the final row height immediately. The pool is per pane — a DOM node
// can't be attached in two places. Slots are an Effect `RcMap`: the acquiring
// atom's scope holds the reference, and the slot's Solid root is disposed once
// the slot has been idle past the TTL.

const SLOT_IDLE_TTL = "7 seconds";

const PRELOAD_SLICE_BUDGET = "8 millis";

export class EditorBootError extends Data.TaggedError("EditorBootError")<{
  readonly recordId: RecordSchema.Id;
  readonly message: string;
}> {}

export type Slot = {
  readonly container: HTMLDivElement;
  readonly ready: Effect.Effect<void, EditorBootError>;
  readonly setAttached: (attached: boolean) => void;
};

export type Pool = {
  readonly get: (recordId: RecordSchema.Id) => Effect.Effect<Slot, never, Scope.Scope>;
  readonly preload: (
    recordIds: ReadonlyArray<RecordSchema.Id>,
  ) => Effect.Effect<void, EditorBootError, Scope.Scope>;
};

export const make = Effect.fn("EditorPool.make")(function* (
  owner: Owner | null,
  filter: Accessor<AttrsSchema.Filter>,
) {
  // Slots are created under the pane's owner so pooled editors keep its contexts
  // (graph runtime, atom registry, RecordLinkScope, router).
  const slots = yield* RcMap.make({
    idleTimeToLive: SLOT_IDLE_TTL,
    lookup: (recordId: RecordSchema.Id) => {
      return Effect.acquireRelease(
        Effect.sync(() => {
          if (!owner) throw new Error("EditorPool requires a Solid owner");

          return runWithOwner(owner, () => createSlot(recordId, filter))!;
        }),
        (slot) => Effect.sync(() => slot.dispose()),
      );
    },
  });

  const get = (recordId: RecordSchema.Id): Effect.Effect<Slot, never, Scope.Scope> => {
    return RcMap.get(slots, recordId);
  };

  const preload = Effect.fn("EditorPool.preload")(function* (
    recordIds: ReadonlyArray<RecordSchema.Id>,
  ) {
    if (recordIds.length === 0) return;

    // Let the triggering click, popover animation, or pane scroll paint its
    // first frame before booting editors on the main thread.
    yield* Frame.next;
    yield* Frame.forEach(
      recordIds,
      (recordId) => Effect.flatMap(get(recordId), (slot) => slot.ready),
      { budget: PRELOAD_SLICE_BUDGET },
    );
  });

  return { get, preload } satisfies Pool;
});

/** Create a pane-owned pool synchronously and close its Effect scope on owner cleanup. */
export function create(filter: Accessor<AttrsSchema.Filter>): Pool {
  const owner = getOwner();
  const scope = Effect.runSync(Scope.make());
  const pool = Effect.runSync(make(owner, filter).pipe(Scope.provide(scope)));

  onCleanup(() => {
    Effect.runFork(Scope.close(scope, Exit.void));
  });

  return pool;
}

const Context = createContext<Accessor<Pool>>();

export function Provider(props: ParentProps<{ pool: Pool }>): JSX.Element {
  return <Context value={() => props.pool}>{props.children}</Context>;
}

export function use(): Accessor<Pool> {
  const pool = useContext(Context);

  if (!pool) throw new Error("Must use inside EditorPool.Provider");

  return pool;
}

type PooledSlot = Slot & {
  readonly dispose: () => void;
};

function createSlot(recordId: RecordSchema.Id, filter: Accessor<AttrsSchema.Filter>): PooledSlot {
  const ready = Deferred.makeUnsafe<void, EditorBootError>();

  return createRoot((dispose) => {
    const docState = LiveDocAtom.use({ recordId: () => recordId });

    // Readiness must resolve during a pending transition, before ordinary effects settle.
    createRenderEffect(docState, (state) => {
      LiveDoc.Doc.$match(state, {
        Loading: () => undefined,
        Ready: () => Effect.runSync(Deferred.succeed(ready, undefined)),
        Error: ({ message }) => {
          return Effect.runSync(
            Deferred.fail(ready, new EditorBootError({ recordId: recordId, message })),
          );
        },
      });
    });

    const [attached, setAttached] = createSignal(false);

    const container = document.createElement("div");
    insert(container, () => (
      <Editor
        recordId={recordId}
        attached={attached()}
        search={Option.getOrUndefined(StreamSettings.firstSearch(filter()))}
        backlinksTo={Option.getOrUndefined(StreamSettings.firstLinkTo(filter()))}
      />
    ));

    return {
      container,
      ready: Deferred.await(ready),
      setAttached,
      dispose,
    } satisfies PooledSlot;
  });
}

export * as EditorPool from "./editor-pool";
