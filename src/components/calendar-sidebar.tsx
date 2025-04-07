import { FileDownIcon, FileUpIcon } from "lucide-react";
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
      <SidebarFooter>
        <NavUser />
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

function CalendarSidebarActions() {
  return (
    <SidebarGroup>
      <SidebarGroupLabel>Actions</SidebarGroupLabel>
      <SidebarGroupContent>
        <SidebarMenu>
          <SidebarMenuItem>
            <ImportDatabaseDialog>
              <SidebarMenuButton>
                <FileUpIcon />
                Import database
              </SidebarMenuButton>
            </ImportDatabaseDialog>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <ExportDatabaseDialog>
              <SidebarMenuButton>
                <FileDownIcon />
                Export database
              </SidebarMenuButton>
            </ExportDatabaseDialog>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
