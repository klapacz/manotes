import { NoteService } from "@/services/note.service";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";

export function noteSearchOptions(query: string) {
  return queryOptions({
    queryKey: ["note-search", query],
    queryFn: async () => NoteService.search({ title: query }),
    placeholderData: keepPreviousData,
  });
}
