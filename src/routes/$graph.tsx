import { createFileRoute, Outlet, redirect } from "@tanstack/solid-router";
import { Runtime, RuntimeProvider } from "../lib";
import { Option, Schema } from "effect";
import { AppSidebar } from "../components/app-sidebar";
import { SidebarInset, SidebarProvider } from "../components/ui/sidebar";
import * as LocalRegistry from "../lib/local-registry";

export const Route = createFileRoute("/$graph")({
  component: RouteComponent,
  validateSearch: Schema.Struct({
    allowCreate: Schema.optional(Schema.Boolean),
  }).pipe(Schema.standardSchemaV1),
  beforeLoad: async ({ params, search }) => {
    const localGraphId = params.graph;
    const graph = await LocalRegistry.Runtime.runtime.runPromise(
      LocalRegistry.Repo.getGraph(localGraphId),
    );

    if (Option.isNone(graph)) {
      throw redirect({ to: "/" });
    }

    const result = await Runtime.setup({
      allowCreate: search.allowCreate ?? false,
      localGraphId,
      displayName: graph.value.displayName,
    });

    return Runtime.setupResult.$match({
      DatabaseNotFound() {
        throw redirect({ to: "/" });
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
            }),
          });
        }
        return { runtime, graph: graph.value };
      },
    })(result);
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
