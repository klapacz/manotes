import { Editor } from "@/components/Editor";
import { db } from "@/sqlocal/client";
import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/_app/notes/$noteId")({
  component: NotePage,
  loader: async ({ params }) => {
    // TODO: use repo
    const note = await db
      .selectFrom("notes")
      .where("notes.id", "=", params.noteId)
      .selectAll("notes")
      .executeTakeFirstOrThrow();

    return note;
  },
  staleTime: 0,
});

function NotePage() {
  const note = Route.useLoaderData();

  return (
    <div className="p-4">
      <Editor note={note} />
    </div>
  );
}
