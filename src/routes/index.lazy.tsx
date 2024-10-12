import { NotesList } from "@/components/notes-list";
import { createLazyFileRoute } from "@tanstack/react-router";

export const Route = createLazyFileRoute("/")({
  component: Index,
});

function Index() {
  return (
    <div className="p-2">
      <NotesList />
    </div>
  );
}
