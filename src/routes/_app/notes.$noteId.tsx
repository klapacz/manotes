import { Editor } from "@/components/Editor";
import { Sidebar } from "@/components/sidebar";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/notes/$noteId")({
  component: NotePage,
});

function NotePage() {
  const { noteId } = Route.useParams();

  return (
    <div className="p-4">
      <Editor noteId={noteId} />
    </div>
  );
}
