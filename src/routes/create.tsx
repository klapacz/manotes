import { createFileRoute, Link } from "@tanstack/solid-router";
import { Schema } from "effect";

export const Route = createFileRoute("/create")({
  component: RouteComponent,
  validateSearch: Schema.Struct({
    graphName: Schema.NonEmptyString,
  }).pipe(Schema.standardSchemaV1),
});

function RouteComponent() {
  const search = Route.useSearch();

  return (
    <div>
      Do you want to create a new graph '{search().graphName}'?
      <Link
        to="/$graph"
        params={{ graph: search().graphName }}
        search={{ allowCreate: true }}
      >
        Yes, create it
      </Link>
    </div>
  );
}
