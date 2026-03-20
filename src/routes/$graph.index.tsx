import { createFileRoute } from "@tanstack/solid-router";
import Editor from "../editor";
import { Schema } from "effect";
import { Temporal } from "temporal-polyfill";
import * as TemporalSchema from "../lib/temporal.schema";

export const Route = createFileRoute("/$graph/")({
  component: RouteComponent,
  validateSearch: Schema.Struct({
    allowCreate: Schema.optional(Schema.Boolean),
    date: Schema.optional(TemporalSchema.PlainDateString).pipe(
      Schema.withDefaults({
        decoding: () => Temporal.Now.plainDateISO().toString(),
        constructor: () => Temporal.Now.plainDateISO().toString(),
      }),
    ),
  }).pipe(Schema.standardSchemaV1),
});

function RouteComponent() {
  const search = Route.useSearch();

  return (
    <div class="p-6">
      <Editor noteId={search().date} isDaily={true} />
    </div>
  );
}
