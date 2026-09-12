import { createFileRoute, redirect } from "@tanstack/solid-router";
import { Array, Effect, Option, Schema } from "effect";
import { GraphDestination } from "../lib/graph-access/graph-runtime/destination";
import * as LocalRegistry from "../lib/graph-access/local-registry";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";
import * as SessionService from "../lib/graph-access/session/service";
import { NoteSearch } from "../lib/note/search";

export const Route = createFileRoute("/open/$graphId")({
  component: () => null,
  validateSearch: NoteSearch.Schema.pipe(Schema.toStandardSchemaV1),
  loaderDeps: ({ search }) => ({ panes: search.panes }),
  loader: async ({ params, deps }) => {
    const graph = await GraphAccessRuntime.rt.runPromise(
      Effect.gen(function* () {
        const session = yield* SessionService.Service.use((service) => service.find);

        if (Option.isNone(session)) return Option.none();

        const graphs = yield* LocalRegistry.Repo.listGraphs({
          accountId: Option.some(session.value.accountId),
        });

        return Array.findFirst(
          graphs,
          (graph) => graph.graphId === params.graphId && graph.status === "active",
        );
      }),
    );

    if (Option.isNone(graph)) {
      throw redirect({ to: "/", replace: true });
    }

    throw redirect(
      GraphDestination.linkOptions(
        graph.value.localGraphId,
        GraphDestination.Destination.cases.notes.make({ panes: deps.panes }),
      ),
    );
  },
});
