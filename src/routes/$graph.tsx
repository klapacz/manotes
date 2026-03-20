import { createFileRoute, Outlet, redirect } from "@tanstack/solid-router";
import { Runtime, RuntimeProvider, createRuntimeStreamStore } from "../lib";
import * as GraphWorkerClient from "../lib/graph-worker.client";
import { Effect, Schema, Stream } from "effect";
import { Show } from "solid-js";
import { DedicatedWorkerHealth } from "../lib/graph.worker-rpc";
import { Temporal } from "temporal-polyfill";
import * as TemporalSchema from "../lib/temporal.schema";
import { AppSidebar } from "../components/app-sidebar";
import { SidebarInset, SidebarProvider } from "../components/ui/sidebar";

export const Route = createFileRoute("/$graph")({
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
  beforeLoad: async ({ params, search }) => {
    const graphName = params.graph;
    const result = await Runtime.setup({
      allowCreate: search.allowCreate ?? false,
      graphName,
    });

    return Runtime.setupResult.$match({
      DatabaseNotFound() {
        // Redirect user so they can confirm creation of new graph
        throw redirect({ to: "/create", search: { graphName } });
      },
      Success({ runtime }) {
        // Remove allowCreate from search params
        if (search.allowCreate) {
          throw redirect({
            from: Route.fullPath,
            to: "/$graph",
            replace: true,
            search: (search) => ({
              ...search,
              allowCreate: undefined,
              date: search.date,
            }),
          });
        }
        return { runtime };
      },
    })(result);
  },
  loader: async ({ context }) => ({ runtime: context.runtime }),
});

function WorkerHealthBanner() {
  const health = createRuntimeStreamStore(
    () =>
      GraphWorkerClient.Service.pipe(
        Effect.map((svc) => svc.client.healthStream({})),
        Stream.unwrap,
      ),
    new DedicatedWorkerHealth({
      status: "down",
      consecutiveFailures: 0,
      lastFailure: "",
    }),
  );

  return (
    <div
      class={`px-4 py-2 text-sm text-center ${
        health.status === "down"
          ? "bg-error-solid text-error-fg-solid"
          : health.status === "healthy"
            ? "bg-success-solid text-success-fg-solid"
            : "bg-warning-solid text-warning-fg-solid"
      }`}
    >
      Worker {health.status}
      <Show when={health.lastFailure}>{`: ${health.lastFailure}`}</Show>
    </div>
  );
}

function RouteComponent() {
  const data = Route.useLoaderData();
  const params = Route.useParams();
  const search = Route.useSearch();

  return (
    <RuntimeProvider runtime={() => data().runtime}>
      <SidebarProvider defaultOpenMobile={true}>
        <AppSidebar graph={params().graph} date={search().date} />
        <SidebarInset>
          <WorkerHealthBanner />
          <div class="flex-1 overflow-auto">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </RuntimeProvider>
  );
}
