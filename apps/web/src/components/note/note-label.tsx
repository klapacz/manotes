import { Match, Option, Stream } from "effect";
import { NoteCache, bindRt, createAtomResultStore, createSyncedAtom } from "../../lib";
import { NoteQuery } from "./note-query";

export function Root(props: { id: string }) {
  const idAtom = createSyncedAtom(() => props.id);

  const note = createAtomResultStore(
    bindRt((rt) => {
      return rt.atom((get) => {
        const id = get(idAtom);

        return NoteCache.Service.use((cache) => cache.changes(id)).pipe(
          Stream.unwrap,
          Stream.map((note) => ({ id, note })),
        );
      });
    }),
  );

  const label = () => {
    return Match.value(note).pipe(
      Match.tag("Loading", () => ""),
      Match.tag("Error", () => "Unable to load note"),
      Match.tag("Success", ({ value }) => {
        // Atoms may retain the previous success while a new ID loads.
        if (value.id !== props.id) return "";

        return Option.match(value.note, {
          onNone: () => "Unavailable note",
          onSome: NoteQuery.label,
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

export * as NoteLabel from "./note-label";
