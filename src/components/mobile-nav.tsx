import { startOfWeek, endOfWeek, eachDayOfInterval, formatISO } from "date-fns";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { SidebarTrigger } from "./ui/sidebar";

const daysInCurrentWeek = eachDayOfInterval({
  start: startOfWeek(new Date()),
  end: endOfWeek(new Date()),
});

export function MobileNav() {
  return (
    <div className="border-grid sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 h-mobile-nav flex justify-center items-center  px-2 gap-2">
      <div className="grid grid-cols-8 gap-2 items-center justify-center">
        {daysInCurrentWeek.map((day) => (
          <Button
            variant="secondary"
            asChild
            className="flex-col gap-0  h-[54px]"
          >
            <Link
              to="/graph"
              search={{ date: formatISO(day, { representation: "date" }) }}
            >
              {day.toLocaleString(undefined, {
                weekday: "short",
              })}

              <span className="text-xs text-muted-foreground">
                {day.toLocaleString(undefined, {
                  day: "numeric",
                  month: "short",
                })}
              </span>
            </Link>
          </Button>
        ))}
        <SidebarTrigger className="shrink-0 w-auto h-[54px]" />
      </div>
    </div>
  );
}

export function useDisplayMobileNav() {
  const isMobile = useIsMobile();
  return isMobile;
}

export const mobileNavEditorClass = "scroll-mt-mobile-nav";
