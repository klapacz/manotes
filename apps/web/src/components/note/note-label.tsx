import { Option, Stream } from "effect";
import { NoteRepo, bindRt, createAtomStore, createSyncedAtom } from "../../lib";
import { NoteQuery } from "./note-query";

export function Root(props: { id: string }) {
  const idAtom = createSyncedAtom(() => props.id);

  const note = createAtomStore(
    bindRt((rt) => {
      return rt.atom((get) => {
        return NoteRepo.Service.use((repo) => {
          return repo.reactiveFindPreviewById({ id: get(idAtom) });
        }).pipe(
          Stream.unwrap,
          Stream.map((value) => ({ note: Option.getOrNull(value) })),
        );
      });
    }),
    { note: null },
  );

  const label = () => (note.value.note ? NoteQuery.label(note.value.note) : "Unavailable note");

  return (
    <span class="min-w-0 truncate" title={label()}>
      {label()}
    </span>
  );
}

export * as NoteLabel from "./note-label";
