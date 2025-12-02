import { createFileRoute, Link } from "@tanstack/solid-router";

export const Route = createFileRoute("/$graph/other")({
  component: RouteComponent,
});

function RouteComponent() {
  return (
    <Link from={Route.fullPath} to="/$graph">
      Go to index
    </Link>
  );
}
