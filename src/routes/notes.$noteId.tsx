import { Editor } from "@/components/Editor";
import { Sidebar } from "@/components/sidebar";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/notes/$noteId")({
  component: NotePage,
});

function NotePage() {
  const { noteId } = Route.useParams();

  return (
    <div className="grid grid-cols-4">
      <div className="p-2 col-span-3">
        <Editor noteId={noteId} />
      </div>
      <Sidebar />
    </div>
  );
}
