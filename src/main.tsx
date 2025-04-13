import { RouterProvider, createRouter } from "@tanstack/react-router";
import { createRoot } from "react-dom/client";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode, Suspense } from "react";
import { MigrationsProvider } from "./providers/migratios-provider";
import { queryClient, trpcClient } from "./lib/trpc";
import { PostHogProvider } from "posthog-js/react";
import "@/styles/globals.css";

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {
    queryClient,
    trpcClient,
  },
});

// Register the router instance for type safety
declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Render the app
export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <Suspense>
        <MigrationsProvider>
          <RouterProvider router={router} />
        </MigrationsProvider>
      </Suspense>
    </QueryClientProvider>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <PostHogProvider
      apiKey={import.meta.env.VITE_PUBLIC_POSTHOG_KEY}
      options={{
        api_host: import.meta.env.VITE_PUBLIC_POSTHOG_HOST,
      }}
    >
      <App />
    </PostHogProvider>
  </StrictMode>,
);
