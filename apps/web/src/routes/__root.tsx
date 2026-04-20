import { RegistryContext } from "@effect/atom-solid";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";
import * as GraphAccessRuntime from "../lib/graph-access/runtime";

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

      <RegistryContext.Provider value={GraphAccessRuntime.registry}>
        <Outlet />
      </RegistryContext.Provider>
      <TanStackRouterDevtools position="bottom-right" />

      <Scripts />
    </>
  );
}
