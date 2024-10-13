import { cn } from "@/lib/utils";
import { Link } from "@tanstack/react-router";
import { CalendarNavigation } from "./calendar-navigation";
import { ExportDatabaseDialog } from "./export-database-dialog";
import { ImportDatabaseDialog } from "./import-database-dialog";
import { Button } from "./ui/button";

type SidebarProps = {
  className?: string;
};

export function Sidebar(props: SidebarProps) {
  return (
    <div className={cn("p-4 w-[280px]", props.className)}>
      <div className="mx-auto">
        <CalendarNavigation />
      </div>

      <div className="space-y-1 pt-5">
        <Button variant="secondary" size="sm" className="w-full" asChild>
          <Link to="/studio">Studio</Link>
        </Button>
      </div>

      <div className="space-y-1 pt-5">
        <p className="text-xs font-medium text-muted-foreground pb-2">
          Actions
        </p>
        <ImportDatabaseDialog>
          <Button variant="outline" size="sm" className="w-full">
            Import database
          </Button>
        </ImportDatabaseDialog>
        <ExportDatabaseDialog>
          <Button variant="outline" size="sm" className="w-full">
            Export database
          </Button>
        </ExportDatabaseDialog>
      </div>
    </div>
  );
}
