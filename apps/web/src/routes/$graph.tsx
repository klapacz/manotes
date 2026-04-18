import { useAtomValue } from "@effect/atom-solid";
import { createFileRoute, Navigate, Outlet } from "@tanstack/solid-router";
import { AppSidebar } from "../components/app-sidebar";
import { SidebarInset, SidebarProvider } from "../components/ui/sidebar";
import { MatchAsyncResult, MatchTag, createSyncedAtom } from "../lib";
import { GraphProvider } from "../lib/graph-access/graph-runtime/context";
import * as GraphRuntime from "../lib/graph-access/graph-runtime";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";
import { Stream } from "effect";

export const Route = createFileRoute("/$graph")({
  component: RouteComponent,
});

function RouteComponent() {
  const params = Route.useParams();
  const localGraphIdAtom = createSyncedAtom(() => params().graph);

  const stateAtom = GraphAccessRuntime.atom.atom((get) =>
    GraphRuntime.Manager.Service.use((manager) => manager.findReactive(get(localGraphIdAtom))).pipe(
      Stream.unwrap,
    ),
  );

  const state = useAtomValue(stateAtom);

  return (
    <MatchAsyncResult
      when={state()}
      // Use onError/onDefect instead of onFailure so we rethrow the original error
      // values into router error handling, rather than throwing the combined Cause.
      onError={(error) => {
        throw error();
      }}
      onDefect={(defect) => {
        throw defect();
      }}
      onSuccess={(state) => (
        <MatchTag
          when={state()}
          cases={{
            Missing: (state) => <Navigate {...GraphRuntime.Router.redirectLinkOptions(state())} />,
            Locked: (state) => <Navigate {...GraphRuntime.Router.redirectLinkOptions(state())} />,
            Ready: (graph) => (
              <GraphProvider graph={graph}>
                <SidebarProvider defaultOpenMobile={true}>
                  <AppSidebar />
                  <SidebarInset>
                    <div class="flex-1 overflow-auto">
                      <Outlet />
                    </div>
                  </SidebarInset>
                </SidebarProvider>
              </GraphProvider>
            ),
          }}
        />
      )}
    />
  );
}
