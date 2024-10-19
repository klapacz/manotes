import { NotesSearchCommandDialog } from "@/components/notes-search";
import { CalendarSidebar } from "@/components/calendar-sidebar";
import { ScrollArea } from "@/components/ui/scroll-area";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_app")({
  component: () => <AppLayout />,
});

function AppLayout() {
  return (
    <SidebarProvider>
      <NotesSearchCommandDialog />
      <SidebarInset>
        <ScrollArea>
          <main className="max-h-[100svh]">
            <Outlet />
          </main>
        </ScrollArea>
      </SidebarInset>
      <CalendarSidebar side="right" className="border-l" />
    </SidebarProvider>
  );
}
