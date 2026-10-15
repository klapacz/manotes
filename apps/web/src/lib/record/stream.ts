import type { RecordRepo } from "@manotes/shared/record.repo";
import { Array, DateTime, Predicate } from "effect";
import type { AudioMemoSession } from "../audio-memo/session";
import type * as RecordSchema from "@manotes/shared/record.schema";
import { toLocalDateString } from "@manotes/shared/temporal/utils";
import type { StreamSort } from "@manotes/shared/record/pane.schema";

export type InnerItem = {
  /** Latest row data for this pinned stream item, refreshed on every SQL emission. */
  record: RecordRepo.Meta;
  /** Separator bucket captured when the item entered the stream. */
  groupKey: string;
  /** True when the item would move or disappear after a full refresh. */
  dirty: boolean;
};

/**
 * `id` is the rendered row identity used by reconciliation and the
 * reconciled store. Keeping it stable preserves mounted editors and recordings
 * across updates; different variant keys replace the draft with its record.
 *
 * A group separator is not its own row: the first item of each run carries
 * `firstInGroup`, and the row renders the dated divider above its content.
 */
export type ListItem = (RecordItem | DraftItem) & {
  firstInGroup: boolean;
};

type RecordItem = InnerItem & { _tag: "record"; id: string };

type DraftItem = {
  _tag: "draft";
  id: string;
  draft: AudioMemoSession.Draft;
  groupKey: string;
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
// New records are inserted at their SQL position. Notes already present in the
// stream keep their pinned relative position: each matching live row reserves
// a slot that is filled from the old pinned order. If SQL wanted a different
// record for that slot, the pinned filler is retained but marked dirty because a
// refresh would move it. Notes that disappeared from SQL are retained next to
// their old neighbours and marked dirty.
//
// `sort` is fixed for a stream instance; changing the query/sort recreates the
// pane atom and starts from an empty state.
export const retain = (sort: StreamSort) => {
  return (prev: State, live: ReadonlyArray<RecordRepo.Meta>): State => {
    const liveById = new Map(Array.map(live, (record) => [record.id, record] as const));
    const prevIds = new Set(Array.map(prev.items, ({ record }) => record.id));

    const refresh = (item: InnerItem): InnerItem => {
      const fresh = liveById.get(item.record.id);

      if (!fresh) return { ...item, dirty: true };

      return {
        record: fresh,
        groupKey: item.groupKey,
        dirty: groupKey(fresh, sort) !== item.groupKey,
      };
    };

    const refreshed = Array.map(prev.items, refresh);

    // `remaining` is the not-yet-emitted suffix of the previous stream order.
    // Each live row emits either itself (new record) or the next still-live item
    // from that suffix (existing record). A mismatched existing record means SQL
    // order changed underneath the pinned stream.
    const [leftover, slots] = Array.mapAccum(live, refreshed, (remaining, liveRecord) => {
      if (prevIds.has(liveRecord.id)) {
        // Items that no longer match the SQL result have no live slot of their
        // own, so emit them immediately before the next still-live item.
        const [retained, rest] = Array.span(remaining, (item) => !liveById.has(item.record.id));

        return Array.matchLeft(rest, {
          onNonEmpty: (slotFiller, upcoming) => {
            const moved = slotFiller.record.id !== liveRecord.id;
            const filler = moved ? { ...slotFiller, dirty: true } : slotFiller;

            return [upcoming, [...retained, filler]];
          },
          onEmpty: () => [[], retained],
        });
      }

      // First appearance in the stream: capture the current grouping bucket.
      const incoming: InnerItem = {
        record: liveRecord,
        groupKey: groupKey(liveRecord, sort),
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
};

/** Inserts the local draft, then marks each group's first row in the final order. */
export function list(options: {
  items: InnerItems;
  draft: AudioMemoSession.Draft | undefined;
  sort: StreamSort;
}): ReadonlyArray<ListItem> {
  const records = Array.map(options.items, (item): RecordItem => ({
    // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- Plain rows are reconciled by ID to preserve mounted editors and recordings.
    _tag: "record",
    id: `record:${item.record.id}`,
    ...item,
  }));

  const items = insertDraft(records, options.draft, options.sort);

  // SAFETY: The accumulator starts as null and becomes each item's string group key.
  const [, rows] = Array.mapAccum(items, null as string | null, (lastGroupKey, item) => {
    const row: ListItem = {
      ...item,
      firstInGroup: item.groupKey !== lastGroupKey,
    };

    return [item.groupKey, row];
  });

  return rows;
}

export function recordId(row: ListItem): RecordSchema.Id {
  if (Predicate.isTagged(row, "record")) return row.record.id;

  return row.draft.id;
}

export function date(row: ListItem): string {
  if (Predicate.isTagged(row, "record")) return row.record.date;

  return row.draft.intent.date;
}

function insertDraft(
  records: ReadonlyArray<RecordItem>,
  draft: AudioMemoSession.Draft | undefined,
  sort: StreamSort,
): ReadonlyArray<RecordItem | DraftItem> {
  if (!draft) return records;

  // Replace the draft when its transcript enters the stream. Unmounting the
  // draft row then clears the local draft state.
  if (Array.some(records, (row) => row.record.id === draft.id)) return records;

  const createdAt = DateTime.toEpochMillis(draft.createdAt);

  // Insert into the retained order without moving pinned records. Drafts stay
  // outside the pinned snapshot, so cancellation removes them immediately.
  const [before, after] = Array.span(records, ({ record }) => {
    if (sort === "date") {
      if (record.date !== draft.intent.date) return record.date > draft.intent.date;

      return DateTime.toEpochMillis(record.createdAt) >= createdAt;
    }

    return DateTime.toEpochMillis(record.updatedAt) >= createdAt;
  });

  const row: DraftItem = {
    // oxlint-disable-next-line anti-slop-effect/no-manual-tagged-construction -- The variant key makes reconciliation replace the draft when its transcript arrives.
    _tag: "draft",
    id: `draft:${draft.id}`,
    draft,
    groupKey: sort === "date" ? draft.intent.date : toLocalDateString(draft.createdAt),
  };

  return Array.appendAll(Array.append(before, row), after);
}

function groupKey(record: RecordRepo.Meta, sort: StreamSort): string {
  return sort === "date" ? record.date : toLocalDateString(record.updatedAt);
}

export * as RecordStream from "./stream";
