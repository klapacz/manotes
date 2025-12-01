import {
  HeadContent,
  Outlet,
  Scripts,
  createRootRouteWithContext,
} from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";

import styleCss from "../styles.css?url";
import { Runtime } from "../lib";

export const Route = createRootRouteWithContext()({
  beforeLoad: async () => {
    await Runtime.runtime.runPromise(Runtime.setup);
  },
  head: () => ({
    links: [{ rel: "stylesheet", href: styleCss }],
  }),
  shellComponent: RootComponent,
});

function RootComponent() {
  return (
    <>
      <HeadContent />

      <Outlet />
      <TanStackRouterDevtools />

      <Scripts />
    </>
  );
}
