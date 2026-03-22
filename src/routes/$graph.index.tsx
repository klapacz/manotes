import { createFileRoute } from "@tanstack/solid-router";
import Editor from "../editor";
import { Option, Schema } from "effect";
import { Temporal } from "temporal-polyfill";
import * as TemporalSchema from "../lib/temporal.schema";
import * as TemporalUtils from "../lib/temporal/utils";
import { batch, createEffect, createSignal, on, untrack } from "solid-js";
import { VList, type VListHandle } from "virtua/solid";
import { scrollToDateRequest } from "../lib/daily-note";

export const Route = createFileRoute("/$graph/")({
  component: RouteComponent,
  validateSearch: Schema.Struct({
    date: Schema.optional(TemporalSchema.PlainDateString).pipe(
      Schema.withDefaults({
        decoding: () => Temporal.Now.plainDateISO().toString(),
        constructor: () => Temporal.Now.plainDateISO().toString(),
      }),
    ),
  }).pipe(Schema.standardSchemaV1),
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

    const lastVisibleIndex = handle.findItemIndex(
      handle.scrollOffset + handle.viewportSize,
    );
    const isNearEnd =
      lastVisibleIndex >= loadedDates.length - 1 - LOAD_MORE_THRESHOLD;

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

  const [focusNoteId, setFocusNoteId] = createSignal<string | null>(null);

  createEffect(() => {
    const date = Temporal.PlainDate.from(search().date);
    const handle = listHandle();

    if (!handle) return;
    if (skipNextSearchSync) return (skipNextSearchSync = false);
    if (listUpdatePhase !== null) return;

    const index = dates().findIndex((loadedDate) => loadedDate.equals(date));

    if (index === -1) {
      seedAroundDate(date);
    } else {
      handle.scrollToIndex(index, { align: "start" });
    }

    setFocusNoteId(date.toString());
  });

  // Scroll back to the already-selected date and focus its editor.
  // Bypasses the router's deepEqual so re-clicking the same date works.
  createEffect(
    on(scrollToDateRequest, (request) => {
      if (!request) return;

      const handle = listHandle();
      if (!handle) return;

      const date = Temporal.PlainDate.from(search().date);
      const index = dates().findIndex((d) => d.equals(date));
      if (index !== -1) {
        handle.scrollToIndex(index, { align: "start" });
      }

      setFocusNoteId(date.toString());
    }),
  );

  return (
    <>
      {/* The scrollable element for your list */}
      <VList
        ref={setListHandle}
        data={dates()}
        shift={shift()}
        bufferSize={400}
        onScroll={maybeExtendWindow}
        style={{
          height: "100%",
        }}
      >
        {(date) => (
          <div class="border-b border-border-subtle">
            <div class="mx-auto max-w-3xl px-6 py-10">
              <Editor
                noteId={date.toString()}
                isDaily={true}
                initial={Option.none()}
                autoFocus={focusNoteId() === date.toString()}
                style={{ "min-height": "600px" }}
                onFocusIn={() => {
                  setFocusNoteId(null);
                  const dateStr = date.toString();
                  if (search().date === dateStr) return;
                  void navigate({
                    to: ".",
                    search: { date: dateStr },
                  });
                  skipNextSearchSync = true;
                }}
              />
            </div>
          </div>
        )}
      </VList>
    </>
  );
}

const INITIAL_DAYS_BEFORE = 10;
const INITIAL_DAYS_AFTER = 10;
const INITIAL_FOCUS_INDEX = INITIAL_DAYS_BEFORE;
const PAGE_SIZE = 14;
const LOAD_MORE_THRESHOLD = 3;

function createWindowDates(
  centerDate: Temporal.PlainDate,
): Array<Temporal.PlainDate> {
  return TemporalUtils.createDateRange(
    centerDate.subtract({ days: INITIAL_DAYS_BEFORE }),
    INITIAL_DAYS_BEFORE + INITIAL_DAYS_AFTER + 1,
  );
}

function createLeadingDates(
  firstDate: Temporal.PlainDate,
  count: number,
): Array<Temporal.PlainDate> {
  return TemporalUtils.createDateRange(
    firstDate.subtract({ days: count }),
    count,
  );
}

function createTrailingDates(
  lastDate: Temporal.PlainDate,
  count: number,
): Array<Temporal.PlainDate> {
  return TemporalUtils.createDateRange(lastDate.add({ days: 1 }), count);
}
