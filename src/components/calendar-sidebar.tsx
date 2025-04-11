import {
  DatabaseZapIcon,
  FileDownIcon,
  FileUpIcon,
  FolderSyncIcon,
  SearchIcon,
} from "lucide-react";
import { useNotesSearchDialog } from "@/contexts/notes-search-dialog-context";
import { CalendarNavigation } from "./calendar-navigation";
import { ExportDatabaseDialog } from "./export-database-dialog";
import { ImportDatabaseDialog } from "./import-database-dialog";
import { PurgeDatabaseDialog } from "./purge-database-dialog";
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
import { Link } from "@tanstack/react-router";
import { useWsStore } from "@/routes/-ws-provider";

export function CalendarSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  const activeEditors = useWsStore((store) => store.providers.size);
  const isOnline = useWsStore((store) => !!store.ws);

  return (
    <Sidebar {...props}>
      <SidebarContent>
        <CalendarNavigation />

        <SidebarSeparator className="mx-0" />

        <CalendarSidebarActions />
      </SidebarContent>
      <SidebarFooter>
        <span className="text-xs text-muted-foreground flex justify-center items-baseline gap-2">
          {activeEditors} editors active
          <span
            className={`h-2 w-2 block rounded-full ${isOnline ? "bg-green-500" : "bg-red-500"}`}
          />
        </span>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function CalendarSidebarActions() {
  const { setOpen } = useNotesSearchDialog();

  return (
    <SidebarGroup>
      <SidebarGroupLabel>Actions</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => setOpen(true)}>
              <SearchIcon />
              Search notes
            </SidebarMenuButton>
          </SidebarMenuItem>

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

          {/* Purge database */}
          <SidebarMenuItem>
            <PurgeDatabaseDialog>
              <SidebarMenuButton>
                <FolderSyncIcon />
                Purge database
              </SidebarMenuButton>
            </PurgeDatabaseDialog>
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
