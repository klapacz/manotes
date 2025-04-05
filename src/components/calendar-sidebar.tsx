import {
  DatabaseZapIcon,
  FileDownIcon,
  FileUpIcon,
  FolderSyncIcon,
} from "lucide-react";
import { CalendarNavigation } from "./calendar-navigation";
import { ExportDatabaseDialog } from "./export-database-dialog";
import { ImportDatabaseDialog } from "./import-database-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  SidebarSeparator,
} from "./ui/sidebar";
import { NavUser } from "./nav-user";
import { NoteService } from "@/services/note.service";
import { useMutation } from "@tanstack/react-query";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Link } from "@tanstack/react-router";
import { useWsStore } from "@/routes/-ws-provider";

export function CalendarSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const activeEditors = useWsStore((store) => store.providers.size);
  return (
    <Sidebar {...props}>
      <SidebarContent>
        <CalendarNavigation />

        <SidebarSeparator className="mx-0" />

        <CalendarSidebarActions />
      </SidebarContent>
      <SidebarFooter>
        <span className="text-xs text-muted-foreground text-center">
          {activeEditors} editors active
        </span>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function CalendarSidebarActions() {
  const purgeDatabase = useMutation(
    trpc.note.purge.mutationOptions({
      onSuccess: () => {
        localStorage.removeItem("lastSync");
        toast("Database purged successfully");
      },
    }),
  );

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Actions</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          {/* Import database */}
          <SidebarMenuItem>
            <ImportDatabaseDialog>
              <SidebarMenuButton>
                <FileUpIcon />
                Import database
              </SidebarMenuButton>
            </ImportDatabaseDialog>
          </SidebarMenuItem>

          {/* Export database */}
          <SidebarMenuItem>
            <ExportDatabaseDialog>
              <SidebarMenuButton>
                <FileDownIcon />
                Export database
              </SidebarMenuButton>
            </ExportDatabaseDialog>
          </SidebarMenuItem>

          {/* Sync database */}
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => NoteService.sync()}>
              <FolderSyncIcon />
              Sync database
            </SidebarMenuButton>
          </SidebarMenuItem>

          {/* Sync database */}
          <SidebarMenuItem>
            <SidebarMenuButton
              onClick={() => purgeDatabase.mutate()}
              disabled={purgeDatabase.isPending}
            >
              <FolderSyncIcon />
              Purge database
            </SidebarMenuButton>
          </SidebarMenuItem>

          <SidebarMenuItem>
            <SidebarMenuButton asChild>
              <Link to="/studio">
                <DatabaseZapIcon />
                Studio
              </Link>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
