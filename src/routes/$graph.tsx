import { createFileRoute, Outlet, redirect } from "@tanstack/solid-router";
import { Runtime, RuntimeProvider } from "../lib";
import { Option } from "effect";
import { AppSidebar } from "../components/app-sidebar";
import { SidebarInset, SidebarProvider } from "../components/ui/sidebar";
import * as LocalRegistry from "../lib/local-registry";

export const Route = createFileRoute("/$graph")({
  component: RouteComponent,
  beforeLoad: async ({ params }) => {
    const localGraphId = params.graph;
    const graph = await LocalRegistry.Runtime.runtime.runPromise(
      LocalRegistry.Repo.getGraph(localGraphId),
    );

    if (Option.isNone(graph)) {
      throw redirect({ to: "/" });
    }

    const runtime = await Runtime.setup({
      localGraphId,
      displayName: graph.value.displayName,
      graphId: graph.value.graphId,
    });

    return { runtime, graph: graph.value };
  },
  loader: async ({ context }) => ({ runtime: context.runtime }),
});

function RouteComponent() {
  const data = Route.useLoaderData();

  return (
    <RuntimeProvider runtime={() => data().runtime}>
      <SidebarProvider defaultOpenMobile={true}>
        <AppSidebar />
        <SidebarInset>
          <div class="flex-1 overflow-auto">
            <Outlet />
          </div>
        </SidebarInset>
      </SidebarProvider>
    </RuntimeProvider>
  );
}
