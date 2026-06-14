import { useAtomValue } from "@effect/atom-solid";
import { createFileRoute, Navigate, Outlet } from "@tanstack/solid-router";
import { GraphNavbar } from "../components/graph-navbar";
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

  const state = useAtomValue(() => stateAtom);

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
                <div class="flex h-svh flex-col overflow-hidden">
                  <GraphNavbar />
                  <div class="min-h-0 flex-1">
                    <Outlet />
                  </div>
                </div>
              </GraphProvider>
            ),
          }}
        />
      )}
    />
  );
}
