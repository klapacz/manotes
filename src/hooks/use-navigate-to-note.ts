import type { NoteService } from "@/services/note.service";
import { useNavigate } from "@tanstack/react-router";
import { useCallback } from "react";

export function useNavigateToNote() {
  const navigate = useNavigate();

  const navigateToNote = useCallback(
    (note: NoteService.Record) => {
      if (note.daily_at) {
        navigate({
          to: "/graph",
          search: {
            date: note.daily_at,
          },
        });
      } else {
        navigate({
          to: "/notes/$noteId",
          params: {
            noteId: note.id,
          },
        });
      }
    },
    [navigate],
  );

  return navigateToNote;
}
