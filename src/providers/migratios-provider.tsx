import { migrator } from "@/sqlocal/migrator";
import { useSuspenseQuery } from "@tanstack/react-query";
import type { PropsWithChildren } from "react";

/**
 * Provider that will run migrations on mount.
 * Must be wrapped in a Suspense component.
 *
 * TODO: Display error to the user.
 */
export function MigrationsProvider(props: PropsWithChildren) {
  useSuspenseQuery({
    queryKey: ["db"],
    queryFn: async () => {
      const { error, results } = await migrator.migrateToLatest();

      if (error) {
        throw error;
      }

      return results;
    },
    retry: false,
    staleTime: Infinity, // The data will never become stale
    gcTime: Infinity, // The data will never be removed from the cache
    refetchOnMount: false, // Prevent refetching when the component mounts
    refetchOnWindowFocus: false, // Prevent refetching when the window regains focus
    refetchOnReconnect: false, // Prevent refetching when the network reconnects
  });

  return props.children;
}
