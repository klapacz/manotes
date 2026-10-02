import { createFileRoute, Navigate, Outlet } from "@tanstack/solid-router";
import { Stream } from "effect";
import { createMemo, Loading } from "solid-js";
import { GraphNavbar } from "../components/graph-navbar";
import { MatchTag } from "../lib";
import { GraphProvider } from "../lib/graph-access/graph-runtime/context";
import * as GraphRuntime from "../lib/graph-access/graph-runtime";
import { GraphDestination } from "../lib/graph-access/graph-runtime/destination";
import { runStream } from "../lib/solid-effect";

export const Route = createFileRoute("/$graph")({
  component: RouteComponent,
});

function RouteComponent() {
  const params = Route.useParams();
  const returnTo = GraphDestination.useCurrent();

  // Failures propagate to the router's error handling as thrown values.
  const state = createMemo(() =>
    runStream(
      GraphRuntime.Manager.Service.use((manager) => manager.findReactive(params().graph)).pipe(
        Stream.unwrap,
      ),
    ),
  );

  return (
    <Loading>
      <MatchTag
        when={state()}
        cases={{
          Missing: (state) => <Navigate {...GraphRuntime.Router.redirectLinkOptions(state())} />,
          Locked: (state) => (
            <Navigate {...GraphRuntime.Router.redirectLinkOptions(state(), returnTo())} />
          ),
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
    </Loading>
  );
}
