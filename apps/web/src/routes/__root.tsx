import { RegistryContext } from "../lib/atom-solid";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";
import { RuntimeContext } from "../lib/solid-effect";
import { Loading } from "solid-js";

import styleCss from "../styles.css?url";

export const Route = createRootRoute({
  head: () => ({
    links: [{ rel: "stylesheet", href: styleCss }],
  }),
  shellComponent: RootComponent,
});

function RootComponent() {
  return (
    <>
      <HeadContent />

      <RegistryContext value={GraphAccessRuntime.registry}>
        <RuntimeContext value={GraphAccessRuntime.rt}>
          {/* Async reads need a boundary; after first content, refetches hold it. */}
          <Loading>
            <Outlet />
          </Loading>
        </RuntimeContext>
      </RegistryContext>
      <TanStackRouterDevtools position="bottom-right" />

      <Scripts />
    </>
  );
}
