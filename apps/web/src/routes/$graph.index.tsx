import { createFileRoute } from "@tanstack/solid-router";

export const Route = createFileRoute("/$graph/")({
  component: RouteComponent,
});

function RouteComponent() {
  return null;
}
