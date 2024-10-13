import { Sidebar } from "@/components/sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app")({
  component: () => <AppLayout />,
});

function AppLayout() {
  return (
    <div className="flex divide-x divide-slate-100">
      <ScrollArea className={"h-screen flex-grow"}>
        <Outlet />
      </ScrollArea>
      <Sidebar />
    </div>
  );
}
