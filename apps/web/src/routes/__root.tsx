import { RegistryProvider } from "@effect/atom-solid";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";

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

      <RegistryProvider>
        <Outlet />
      </RegistryProvider>
      <TanStackRouterDevtools position="bottom-right" />

      <Scripts />
    </>
  );
}
