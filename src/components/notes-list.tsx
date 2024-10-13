import { useSuspenseQuery } from "@tanstack/react-query";
import { Editor } from "./Editor";
import { Fragment, Suspense, useMemo } from "react";
import { Route } from "@/routes/_app/index";
import { formatISO, startOfMonth } from "date-fns";
import { NoteService } from "@/services/note.service";

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

  const monthStartISO = useMemo(() => {
    // get start of the month from the date using date-fns
    const start = formatISO(startOfMonth(date), {
      representation: "date",
    });

    return start;
  }, [date]);

  const { data: days } = useSuspenseQuery({
    queryKey: ["notes", monthStartISO],
    queryFn: async () => {
      return NoteService.listInMonth(monthStartISO);
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
      {days.map(({ day, note }) => (
        <Fragment key={day}>
          <Editor noteId={note.id} />
        </Fragment>
      ))}
    </div>
  );
}
