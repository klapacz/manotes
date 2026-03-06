import { createFileRoute } from "@tanstack/solid-router";
import Editor from "../editor";

export const Route = createFileRoute("/$graph/")({
  component: RouteComponent,
});

function RouteComponent() {
  const search = Route.useSearch();

  return (
    <div class="p-6">
      <Editor noteId={search().date} isDaily={true} />
    </div>
  );
}
