import { NotesList } from "@/components/notes-list";
import { createFileRoute } from "@tanstack/react-router";
import { formatISO } from "date-fns";
import { z } from "zod";
import { zodSearchValidator } from "@tanstack/router-zod-adapter";

export const indexSearchSchema = z.object({
  date: z
    .string()
    .date()
    // default to today
    .default(() => formatISO(new Date(), { representation: "date" })),
});

export const Route = createFileRoute("/_app/")({
  component: Index,
  validateSearch: zodSearchValidator(indexSearchSchema),
});

function Index() {
  return (
    <div className="p-4">
      <NotesList />
    </div>
  );
}
