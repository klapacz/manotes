import { createFileRoute } from "@tanstack/solid-router";
import Editor from "../editor";
import { Effect, Schema } from "effect";
import { Temporal } from "temporal-polyfill";
import * as TemporalSchema from "../lib/temporal.schema";
import * as TemporalUtils from "../lib/temporal/utils";
import { batch, createEffect, createSignal, on, untrack } from "solid-js";
import { VList, type VListHandle } from "virtua/solid";

export const Route = createFileRoute("/$graph/")({
  component: RouteComponent,
  loaderDeps: ({ search: { date } }) => ({ date }),
  remountDeps: () => [],
  loader: async () => {
    return null;
  },
  validateSearch: Schema.Struct({
    date: TemporalSchema.PlainDateString.pipe(
      Schema.withDecodingDefault(Effect.sync(() => Temporal.Now.plainDateISO().toString())),
    ),
  }).pipe(Schema.toStandardSchemaV1),
});

function RouteComponent() {
  return <DailyNotes />;
}

function DailyNotes() {
  const search = Route.useSearch();
  const navigate = Route.useNavigate();

  let skipNextSearchSync = false;
  let listUpdatePhase: "prepend" | "append" | "seed" | null = null;

  // This needs to be reactive so effects can respond once the Virtua ref is set.
  const [listHandle, setListHandle] = createSignal<VListHandle>();
  const [shift, setShift] = createSignal(false);
  const [dates, setDates] = createSignal(
    createWindowDates(Temporal.PlainDate.from(untrack(() => search().date))),
  );

  const maybeExtendWindow = () => {
    const handle = listHandle();
    const loadedDates = dates();

    if (!handle || listUpdatePhase !== null || loadedDates.length === 0) {
      return;
    }

    const firstVisibleIndex = handle.findItemIndex(handle.scrollOffset);
    const isNearStart = firstVisibleIndex <= LOAD_MORE_THRESHOLD;

    if (isNearStart) {
      prependDates(loadedDates);
      return;
    }

    const lastVisibleIndex = handle.findItemIndex(handle.scrollOffset + handle.viewportSize);
    const isNearEnd = lastVisibleIndex >= loadedDates.length - 1 - LOAD_MORE_THRESHOLD;

    if (isNearEnd) {
      appendDates(loadedDates);
    }
  };

  const prependDates = (loadedDates: ReadonlyArray<Temporal.PlainDate>) => {
    listUpdatePhase = "prepend";
    batch(() => {
      setShift(true);
      setDates((currentDates) => [
        ...createLeadingDates(loadedDates[0]!, PAGE_SIZE),
        ...currentDates,
      ]);
    });

    // Let Virtua observe the prepended data while `shift` is still true, then
    // clear the transient prepend state after the reactive update has flushed.
    queueMicrotask(() => {
      setShift(false);
      listUpdatePhase = null;
    });
  };

  const appendDates = (loadedDates: ReadonlyArray<Temporal.PlainDate>) => {
    listUpdatePhase = "append";
    setDates((currentDates) => [
      ...currentDates,
      ...createTrailingDates(loadedDates[loadedDates.length - 1]!, PAGE_SIZE),
    ]);

    queueMicrotask(() => {
      listUpdatePhase = null;
    });
  };

  const seedAroundDate = (date: Temporal.PlainDate) => {
    const handle = listHandle();

    listUpdatePhase = "seed";
    batch(() => {
      setShift(false);
      setDates(createWindowDates(date));
    });

    queueMicrotask(() => {
      handle?.scrollToIndex(INITIAL_FOCUS_INDEX, {
        align: "start",
      });
      listUpdatePhase = null;
    });
  };

  // VList (virtua) renders 0 items on the first frame — it waits for
  // ResizeObserver to measure the viewport before rendering. The View
  // Transitions API snapshots this blank state, making the enter animation
  // invisible. Instead we use a CSS opacity fade-in after VList has items.
  // Double-rAF: the first frame commits opacity:0 to pixels, the second
  // flips to opacity:1 so the CSS transition actually animates.
  const [ready, setReady] = createSignal(false);

  createEffect(() => {
    if (!listHandle()) return;
    requestAnimationFrame(() => requestAnimationFrame(() => setReady(true)));
  });

  const [focusNoteId, setFocusNoteId] = createSignal<string | null>(null);

  const scrollToDate = (date: Temporal.PlainDate) => {
    const handle = listHandle();
    const loadedDates = dates();

    if (!handle) return;

    const index = loadedDates.findIndex((loadedDate) => loadedDate.equals(date));

    if (index === -1) {
      seedAroundDate(date);
    } else {
      handle.scrollToIndex(index, { align: "start" });
    }

    setFocusNoteId(date.toString());
  };

  createEffect(
    on([() => search().date, listHandle], ([dateString, handle]) => {
      if (!handle) return;
      if (skipNextSearchSync) return (skipNextSearchSync = false);
      if (listUpdatePhase !== null) return;

      scrollToDate(Temporal.PlainDate.from(dateString));
    }),
  );

  return (
    <div
      class="h-full transition-opacity duration-150 ease-out"
      classList={{ "opacity-0": !ready() }}
    >
      <VList
        ref={setListHandle}
        data={dates()}
        shift={shift()}
        bufferSize={1200}
        onScroll={maybeExtendWindow}
        style={{
          height: "100%",
        }}
      >
        {(date) => (
          <div class="border-b border-border-subtle">
            <div class="mx-auto max-w-4xl space-y-8 px-6 py-10">
              <Editor
                noteId={date.toString()}
                autoFocus={focusNoteId() === date.toString()}
                style={{ "min-height": "600px" }}
                onFocusIn={() => {
                  setFocusNoteId(null);
                  const dateStr = date.toString();
                  if (search().date === dateStr) return;
                  skipNextSearchSync = true;
                  void navigate({
                    to: ".",
                    search: { date: dateStr },
                    viewTransition: false,
                  });
                }}
              />
            </div>
          </div>
        )}
      </VList>
    </div>
  );
}

const INITIAL_DAYS_BEFORE = 10;
const INITIAL_DAYS_AFTER = 10;
const INITIAL_FOCUS_INDEX = INITIAL_DAYS_BEFORE;
const PAGE_SIZE = 14;
const LOAD_MORE_THRESHOLD = 3;

function createWindowDates(centerDate: Temporal.PlainDate): Array<Temporal.PlainDate> {
  return TemporalUtils.createDateRange(
    centerDate.subtract({ days: INITIAL_DAYS_BEFORE }),
    INITIAL_DAYS_BEFORE + INITIAL_DAYS_AFTER + 1,
  );
}

function createLeadingDates(
  firstDate: Temporal.PlainDate,
  count: number,
): Array<Temporal.PlainDate> {
  return TemporalUtils.createDateRange(firstDate.subtract({ days: count }), count);
}

function createTrailingDates(
  lastDate: Temporal.PlainDate,
  count: number,
): Array<Temporal.PlainDate> {
  return TemporalUtils.createDateRange(lastDate.add({ days: 1 }), count);
}
