import { NoteService } from "@/services/note.service";
import { Link } from "@tanstack/react-router";

type LinkNoteProps = {
  note: NoteService.Record;
} & Omit<React.ComponentProps<typeof Link>, "to" | "params" | "search">;

export function LinkNote({ note, ...props }: LinkNoteProps) {
  if (note.daily_at) {
    return (
      <Link to="/" search={{ date: note.daily_at }} {...props}>
        {NoteService.formatDailyNoteTitle(note.daily_at)}
      </Link>
    );
  }

  return (
    <Link to="/notes/$noteId" params={{ noteId: note.id }} {...props}>
      {note.title}
    </Link>
  );
}
