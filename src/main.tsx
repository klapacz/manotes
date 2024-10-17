import { RouterProvider, createRouter } from "@tanstack/react-router";

// Import the generated route tree
import { routeTree } from "./routeTree.gen";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense } from "react";
import { MigrationsProvider } from "./providers/migratios-provider";

const queryClient = new QueryClient();

// Create a new router instance
const router = createRouter({
  routeTree,
  context: {
    queryClient,
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
