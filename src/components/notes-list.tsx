import { db } from "@/sqlocal/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Editor } from "./Editor";
import { Suspense, useMemo } from "react";
import { Route } from "@/routes/_app/index";
import { addMonths, formatISO, startOfMonth } from "date-fns";

type NotesListProps = {
  className?: string;
};

export function NotesList(props: NotesListProps) {
  return (
    <Suspense fallback={<NotesListFallback {...props} />}>
      <NotesListInner {...props} />
    </Suspense>
  );
}

// TODO: block navigation until the query is done instead of using a fallback
function NotesListFallback(props: NotesListProps) {
  return <div></div>;
}

function NotesListInner(props: NotesListProps) {
  const { date } = Route.useSearch();

  const month = useMemo(() => {
    // get start of the month from the date using date-fns
    const start = formatISO(startOfMonth(date), {
      representation: "date",
    });

    return start;
  }, [date]);

  const { data: notes } = useSuspenseQuery({
    queryKey: ["notes", month],
    queryFn: async () => {
      const nextMonth = formatISO(addMonths(month, 1), {
        representation: "date",
      });

      return await db
        .selectFrom("notes")
        .orderBy("notes.title", "asc")
        .select(["notes.id", "notes.title"])
        .where((eb) => {
          return eb.and([
            eb("daily_at", ">=", month),
            eb("daily_at", "<", nextMonth),
          ]);
        })
        .execute();
    },

    // Refetch only on mount, and do not cache the result
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  return (
    <div className="space-y-4 pb-[100vh] divide-y divide-slate-100">
      {notes.map((note) => (
        <Editor key={note.id} noteId={note.id} />
      ))}
    </div>
  );
}
