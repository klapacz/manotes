import { Editor } from "@/components/Editor";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/notes/$noteId")({
  component: NotePage,
});

function NotePage() {
  const { noteId } = Route.useParams();

  return (
    <div className="p-2">
      <Editor noteId={noteId} />
    </div>
  );
}
