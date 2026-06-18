import { createFileRoute } from "@tanstack/solid-router";
import { SqliteStudio } from "../dev/studio";

// Dev-only SQL console for the active graph's local database, powered by an
// embedded Outerbase Studio iframe. Visit /<graph>/studio.
export const Route = createFileRoute("/$graph/studio")({
  component: () => <SqliteStudio class="h-full w-full border-0" />,
});
