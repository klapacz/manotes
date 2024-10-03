import {
  QueryClient,
  QueryClientProvider,
  useSuspenseQuery,
} from "@tanstack/react-query";
import { Suspense, useState, type PropsWithChildren } from "react";
import { migrator } from "@/sqlocal/migrator";
import { NotesList } from "@/components/notes-list";
import { Button } from "@/components/ui/button";
import { Studio } from "@/components/studio";

const queryClient = new QueryClient();

export function App() {
  const [show, setShow] = useState<"notes" | "studio">("notes");
  return (
    <div className="p-2">
      <QueryClientProvider client={queryClient}>
        <Suspense>
          <MigrationsProvider>
            <Button
              onClick={() =>
                setShow((current) => (current === "notes" ? "studio" : "notes"))
              }
            >
              {show === "notes" ? "Studio" : "Notes"}
            </Button>
            {show === "notes" && <NotesList />}
            {show === "studio" && <Studio />}
          </MigrationsProvider>
        </Suspense>
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
