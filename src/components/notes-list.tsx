import { db } from "@/sqlocal/client";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Editor } from "./Editor";
import { Suspense, useMemo } from "react";
import { ScrollArea } from "./ui/scroll-area";
import { cn } from "@/lib/utils";
import { Route } from "@/routes";
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

function NotesListFallback(props: NotesListProps) {
  return <div className={cn("h-screen", props.className)}></div>;
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
    <ScrollArea className={cn("h-screen px-4", props.className)}>
      <div className="space-y-4 pb-72">
        {notes.map((note) => (
          <Editor key={note.id} noteId={note.id} />
        ))}
      </div>
    </ScrollArea>
  );
}
