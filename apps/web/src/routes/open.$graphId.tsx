import { createFileRoute, redirect } from "@tanstack/solid-router";
import { Array, Effect, Option, Schema } from "effect";
import { GraphDestination } from "../lib/graph-access/graph-runtime/destination";
import { LocalRegistry } from "../lib/graph-access/local-registry";
import { GraphAccessRuntime } from "../lib/graph-access/runtime";
import { SessionService } from "../lib/graph-access/session/service";
import { RecordSearch } from "@manotes/shared/record/search";

export const Route = createFileRoute("/open/$graphId")({
  component: () => null,
  validateSearch: RecordSearch.Schema.pipe(Schema.toStandardSchemaV1),
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

    if (Option.isNone(graph)) throw redirect({ to: "/", replace: true });

    throw redirect(
      GraphDestination.linkOptions(
        graph.value.localGraphId,
        GraphDestination.Destination.cases.records.make({ panes: deps.panes }),
      ),
    );
  },
});
