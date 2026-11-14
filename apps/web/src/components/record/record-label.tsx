import { RecordFormat } from "@manotes/shared/record/format";
import { RecordSchema } from "@manotes/shared/record.schema";
import { Match, Option, Stream } from "effect";
import { RecordCache, bindRt, createAtomResultStore, createSyncedAtom } from "../../lib";

export function Root(props: { id: RecordSchema.Id }) {
  const idAtom = createSyncedAtom(() => props.id);

  const record = createAtomResultStore(
    bindRt((rt) => {
      return rt.atom((get) => {
        const id = get(idAtom);

        return RecordCache.Service.use((cache) => cache.changes(id)).pipe(
          Stream.unwrap,
          Stream.map((record) => ({ id, record })),
        );
      });
    }),
  );

  const label = () => {
    return Match.value(record).pipe(
      Match.tag("Loading", () => ""),
      Match.tag("Error", () => "Unable to load record"),
      Match.tag("Success", ({ value }) => {
        // Atoms may retain the previous success while a new ID loads.
        if (value.id !== props.id) return "";

        return Option.match(value.record, {
          onNone: () => "Unavailable record",
          onSome: RecordFormat.queryLabel,
        });
      }),
      Match.exhaustive,
    );
  };

  return (
    <span class="min-w-0 truncate" title={label()}>
      {label()}
    </span>
  );
}

export * as RecordLabel from "./record-label";
