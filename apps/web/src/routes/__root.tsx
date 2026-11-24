import { RegistryContext } from "../lib/atom-solid";
import { HeadContent, Outlet, Scripts, createRootRoute } from "@tanstack/solid-router";
import { TanStackRouterDevtools } from "@tanstack/solid-router-devtools";
import { GraphAccessRuntime } from "../lib/graph-access/runtime";

import styleCss from "../styles.css?url";
import sourceSansLatin from "@fontsource-variable/source-sans-3/files/source-sans-3-latin-wght-normal.woff2?url";
import sourceSansLatinExt from "@fontsource-variable/source-sans-3/files/source-sans-3-latin-ext-wght-normal.woff2?url";
import bitterLatin from "@fontsource/bitter/files/bitter-latin-600-normal.woff2?url";
import bitterLatinExt from "@fontsource/bitter/files/bitter-latin-ext-600-normal.woff2?url";

const preloadedFonts = [sourceSansLatin, sourceSansLatinExt, bitterLatin, bitterLatinExt] as const;

export const Route = createRootRoute({
  head: () => ({
    links: [
      ...preloadedFonts.map((href) => ({
        rel: "preload" as const,
        as: "font" as const,
        type: "font/woff2",
        crossOrigin: "anonymous" as const,
        href,
      })),
      { rel: "stylesheet", href: styleCss },
    ],
  }),
  shellComponent: RootComponent,
});

function RootComponent() {
  return (
    <>
      <HeadContent />

      <RegistryContext value={GraphAccessRuntime.registry}>
        <Outlet />
      </RegistryContext>
      <TanStackRouterDevtools position="bottom-right" />

      <Scripts />
    </>
  );
}
