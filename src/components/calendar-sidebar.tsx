import { CalendarNavigation } from "./calendar-navigation";
import { ExportDatabaseDialog } from "./export-database-dialog";
import { ImportDatabaseDialog } from "./import-database-dialog";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarSeparator,
  SidebarTrigger,
} from "./ui/sidebar";

export function CalendarSidebar({
  ...props
}: React.ComponentProps<typeof Sidebar>) {
  return (
    <Sidebar {...props}>
      <SidebarContent>
        <CalendarNavigation />

        <SidebarSeparator className="mx-0" />

        <CalendarSidebarActions />
      </SidebarContent>
    </Sidebar>
  );
}

function CalendarSidebarActions() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Actions</SidebarGroupLabel>
      <SidebarGroupContent>
        {/* Import database */}
        <SidebarMenu>
          <SidebarMenuItem>
            <ImportDatabaseDialog>
              <SidebarMenuButton>Import database</SidebarMenuButton>
            </ImportDatabaseDialog>
          </SidebarMenuItem>
        </SidebarMenu>
        {/* Export database */}
        <SidebarMenu>
          <SidebarMenuItem>
            <ExportDatabaseDialog>
              <SidebarMenuButton>Export database</SidebarMenuButton>
            </ExportDatabaseDialog>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
