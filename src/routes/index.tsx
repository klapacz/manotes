import { NotesList } from "@/components/notes-list";
import { createFileRoute } from "@tanstack/react-router";
import { formatISO } from "date-fns";
import { z } from "zod";
import { zodSearchValidator } from "@tanstack/router-zod-adapter";
import { Sidebar } from "@/components/sidebar";

export const indexSearchSchema = z.object({
  date: z
    .string()
    .date()
    // default to today
    .default(() => formatISO(new Date(), { representation: "date" })),
});

export const Route = createFileRoute("/")({
  component: Index,
  validateSearch: zodSearchValidator(indexSearchSchema),
});

function Index() {
  return (
    <div className="grid grid-cols-4">
      <NotesList className="col-span-3" />
      <Sidebar />
    </div>
  );
}
