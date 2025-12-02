import { createFileRoute, Navigate } from "@tanstack/solid-router";
import { DEFAULT_GRAPH_NAME } from "../lib/constants";

export const Route = createFileRoute("/")({
  component: IndexComponent,
});

function IndexComponent() {
  return <Navigate to="/$graph" params={{ graph: DEFAULT_GRAPH_NAME }} />;
}
