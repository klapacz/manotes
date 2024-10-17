import { db } from "@/sqlocal/client";
import { keepPreviousData, queryOptions } from "@tanstack/react-query";

export function noteSearchOptions(query: string) {
  return queryOptions({
    queryKey: ["note-search", query],
    queryFn: async () => {
      // TODO: move to a repo
      return await db
        .selectFrom("notes")
        .where("title", "like", `%${query}%`)
        .where("daily_at", "is", null)
        .selectAll("notes")
        .limit(20)
        .execute();
    },
    placeholderData: keepPreviousData,
  });
}
