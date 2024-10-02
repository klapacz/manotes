import { Editor } from "@/components/Editor";
import {
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
} from "@tanstack/react-query";
import type { PropsWithChildren } from "react";
import { migrator } from "@/sqlocal/migrator";

const queryClient = new QueryClient();

export function App() {
  return (
    <div className="p-2">
      <QueryClientProvider client={queryClient}>
        <MigrationsProvider>
          <Editor />
        </MigrationsProvider>
      </QueryClientProvider>
    </div>
  );
}

function MigrationsProvider(props: PropsWithChildren) {
  useSuspenseQuery({
    queryKey: ["db"],
    queryFn: async () => {
      const { error, results } = await migrator.migrateToLatest();

      if (error) {
        throw error;
      }

      return results;
    },
    staleTime: Infinity, // The data will never become stale
    gcTime: Infinity, // The data will never be removed from the cache
    refetchOnMount: false, // Prevent refetching when the component mounts
    refetchOnWindowFocus: false, // Prevent refetching when the window regains focus
    refetchOnReconnect: false, // Prevent refetching when the network reconnects
  });

  return props.children;
}
