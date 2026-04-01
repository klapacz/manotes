import { createFileRoute, Outlet, redirect } from "@tanstack/solid-router";
import { Runtime, RuntimeProvider } from "../lib";
import { Option } from "effect";
import { AppSidebar } from "../components/app-sidebar";
import { SidebarInset, SidebarProvider } from "../components/ui/sidebar";
import * as LocalRegistry from "../lib/graph-access/local-registry";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";

export const Route = createFileRoute("/$graph")({
  component: RouteComponent,
  beforeLoad: async ({ params }) => {
    const localGraphId = params.graph;
    const graph = await GraphAccessRuntime.rt.runPromise(LocalRegistry.Repo.getGraph(localGraphId));

    // Check if the graph exists
    if (Option.isNone(graph)) throw redirect({ to: "/" });

    // Use the existing runtime if it exists
    const existingRuntime = Runtime.get(localGraphId);
    if (existingRuntime) {
      return { runtime: existingRuntime, graph: graph.value };
    }

    // If the graph is in cloud mode, redirect to unlock page
    if (graph.value.mode === "cloud") {
      throw redirect({ to: "/$graph/unlock", params: { graph: localGraphId } });
    }

    // If the graph is in local mode, setup a new runtime
    const runtime = await Runtime.setup({
      localGraphId,
      displayName: graph.value.displayName,
      graphSyncConfig: { mode: "local" },
    });
    return { runtime, graph: graph.value };
  },
  loader: async ({ context }) => ({
    runtime: context.runtime,
    graph: context.graph,
  }),
});

function RouteComponent() {
  const data = Route.useLoaderData();

  return (
    <RuntimeProvider runtime={() => data().runtime!}>
      <SidebarProvider defaultOpenMobile={true}>
        <AppSidebar graphDisplayName={data().graph.displayName} />
        <SidebarInset>
          <div class="flex-1 overflow-auto">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </RuntimeProvider>
  );
}
