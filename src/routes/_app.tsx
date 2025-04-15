import { NotesSearchCommandDialog } from "@/components/notes-search";
import { CalendarSidebar } from "@/components/calendar-sidebar";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { createFileRoute, Navigate, Outlet } from "@tanstack/react-router";
import { authClient } from "@/lib/auth-client";
import { MobileNav, useDisplayMobileNav } from "@/components/mobile-nav";
import { WsStoreProvider } from "./-ws-provider";
import { NotesSearchDialogProvider } from "@/contexts/notes-search-dialog-context";

export const Route = createFileRoute("/_app")({
  component: () => <AppLayout />,
});

function AppLayout() {
  const { isPending, data } = authClient.useSession();
  const displayMobileNav = useDisplayMobileNav();

  if (isPending) {
    return null;
  }

  if (!isPending && !data) {
    return <Navigate to="/login" replace />;
  }

  return (
    <SidebarProvider>
      <NotesSearchDialogProvider>
        <WsStoreProvider>
          <NotesSearchCommandDialog />
          <SidebarInset>
            {displayMobileNav ? <MobileNav /> : null}
            <Outlet />
          </SidebarInset>
          <CalendarSidebar side="right" className="border-l" />
        </WsStoreProvider>
      </NotesSearchDialogProvider>
    </SidebarProvider>
  );
}
