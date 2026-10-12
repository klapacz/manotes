import { Effect, Stream } from "effect";
import { NoteRepo } from "@manotes/shared/note.repo";
import type { StreamSettings } from "@manotes/shared/note/stream-settings";
import type { NoteSchema } from "@manotes/shared/note.schema";
import { QueryEngine } from "../../lib/query-engine";

export type Result = { value: NoteSchema.Id; label: string };

export function label(note: { title: string | null; text: string }, query = ""): string {
  const text = query.trim().toLowerCase();

  if (note.title && (!text || note.title.toLowerCase().includes(text))) return note.title;

  return (
    note.text
      .split("\n")
      .find((line) => line.toLowerCase().includes(text) && line.trim())
      ?.trim() ||
    note.title ||
    "Untitled note"
  );
}

export const query = searchQuery(undefined);

export function scoped(opts: { readonly filter: StreamSettings.Filter }) {
  return searchQuery(opts.filter);
}

function searchQuery(filter: StreamSettings.Filter | undefined) {
  const search = Effect.fn("ComponentsNoteNoteQuery.search")(function* (
    request: QueryEngine.Request,
  ) {
    const repo = yield* NoteRepo.Service;

    return yield* repo.reactiveSearchPreview({ search: request.text, filter });
  });

  return QueryEngine.share((request) =>
    Stream.unwrap(search(request)).pipe(
      Stream.map((notes) =>
        notes.map((note) => ({
          value: { value: note.id, label: label(note, request.text) },
          // Body-only hits rank below menu actions and matching page titles.
          score: !request.text.trim()
            ? 1
            : note.title?.toLowerCase().includes(request.text.trim().toLowerCase())
              ? QueryEngine.score({ text: request.text, label: note.title })
              : 0.1,
        })),
      ),
    ),
  );
}

export * as NoteQuery from "./note-query";
