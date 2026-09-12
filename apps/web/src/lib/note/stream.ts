import { Array } from "effect";
import type * as NoteSchema from "../note.schema";
import { toLocalDateString } from "../temporal/utils";
import type { StreamSort } from "./pane.schema";

export type InnerItem = {
  /** Latest row data for this pinned stream item, refreshed on every SQL emission. */
  note: NoteSchema.Meta;
  /** Separator bucket captured when the item entered the stream. */
  groupKey: string;
  /** True when the item would move or disappear after a full refresh. */
  dirty: boolean;
};

/**
 * `id` is the rendered row identity used by reconciliation and the
 * virtualizer. Keeping it stable preserves mounted note editors across
 * stream updates.
 *
 * A group separator is not its own row: the first note of each run carries
 * `firstInGroup`, and the row renders the dated divider above its content.
 */
export type ListItem = {
  _tag: "note";
  id: string;
  note: NoteSchema.Meta;
  groupKey: string;
  dirty: boolean;
  firstInGroup: boolean;
};

export type InnerItems = ReadonlyArray<InnerItem>;

export type State = {
  /** True when at least one pinned item would move or disappear after a full refresh. */
  dirty: boolean;
  items: InnerItems;
};

export const initialState: State = { dirty: false, items: [] };

// Merge one filtered/sorted SQL emission into the pinned stream order.
//
// New notes are inserted at their SQL position. Notes already present in the
// stream keep their pinned relative position: each matching live row reserves
// a slot that is filled from the old pinned order. If SQL wanted a different
// note for that slot, the pinned filler is retained but marked dirty because a
// refresh would move it. Notes that disappeared from SQL are retained next to
// their old neighbours and marked dirty.
//
// `sort` is fixed for a stream instance; changing the query/sort recreates the
// pane atom and starts from an empty state.
export const retain =
  (sort: StreamSort) =>
  (prev: State, live: ReadonlyArray<NoteSchema.Meta>): State => {
    const liveById = new Map(Array.map(live, (note) => [note.id, note] as const));
    const prevIds = new Set(Array.map(prev.items, ({ note }) => note.id));

    const refresh = (item: InnerItem): InnerItem => {
      const fresh = liveById.get(item.note.id);

      if (!fresh) return { ...item, dirty: true };

      return {
        note: fresh,
        groupKey: item.groupKey,
        dirty: groupKey(fresh, sort) !== item.groupKey,
      };
    };

    const refreshed = Array.map(prev.items, refresh);

    // `remaining` is the not-yet-emitted suffix of the previous stream order.
    // Each live row emits either itself (new note) or the next still-live item
    // from that suffix (existing note). A mismatched existing note means SQL
    // order changed underneath the pinned stream.
    const [leftover, slots] = Array.mapAccum(live, refreshed, (remaining, liveNote) => {
      if (prevIds.has(liveNote.id)) {
        // Items that no longer match the SQL result have no live slot of their
        // own, so emit them immediately before the next still-live item.
        const [retained, rest] = Array.span(remaining, (item) => !liveById.has(item.note.id));

        return Array.matchLeft(rest, {
          onNonEmpty: (slotFiller, upcoming) => {
            const moved = slotFiller.note.id !== liveNote.id;
            const filler = moved ? { ...slotFiller, dirty: true } : slotFiller;

            return [upcoming, [...retained, filler]];
          },
          onEmpty: () => [[], retained],
        });
      }

      // First appearance in the stream: capture the current grouping bucket.
      const incoming: InnerItem = {
        note: liveNote,
        groupKey: groupKey(liveNote, sort),
        dirty: false,
      };

      return [remaining, [incoming]];
    });

    // Anything left over is a tail of disappeared items; keep it at the tail.
    const items = [...Array.flatten(slots), ...leftover];

    return {
      dirty: Array.some(items, (item) => item.dirty),
      items,
    };
  };

/** Marks the first note of each run sharing a captured group key. */
export function list(notes: ReadonlyArray<InnerItem>): ReadonlyArray<ListItem> {
  if (!Array.isReadonlyArrayNonEmpty(notes)) return [];

  // SAFETY: The accumulator starts as null and becomes each item's string group key.
  const [, rows] = Array.mapAccum(notes, null as string | null, (lastGroupKey, item) => {
    const noteRow: ListItem = {
      // This plain row tag has no existing Effect constructor.
      // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction
      _tag: "note",
      id: `note:${item.note.id}`,
      note: item.note,
      groupKey: item.groupKey,
      dirty: item.dirty,
      firstInGroup: item.groupKey !== lastGroupKey,
    };

    return [item.groupKey, noteRow];
  });

  return rows;
}

function groupKey(note: NoteSchema.Meta, sort: StreamSort): string {
  return sort === "date" ? note.date : toLocalDateString(note.updatedAt);
}

export * as NoteStream from "./stream";
