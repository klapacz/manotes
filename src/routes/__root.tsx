import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";
import type { QueryClient } from "@tanstack/solid-query";

import styleCss from "../styles.css?url";

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()(
  {
    head: () => ({
      links: [{ rel: "stylesheet", href: styleCss }],
    }),
    shellComponent: RootComponent,
  },
);

function RootComponent() {
  return (
    <>
      <HeadContent />

      <Outlet />
      <TanStackRouterDevtools position="bottom-right" />

      <Scripts />
    </>
  );
}
