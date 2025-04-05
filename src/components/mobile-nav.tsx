import { startOfWeek, endOfWeek, eachDayOfInterval, formatISO } from "date-fns";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";

const daysInCurrentWeek = eachDayOfInterval({
  start: startOfWeek(new Date()),
  end: endOfWeek(new Date()),
});

export function MobileNav() {
  return (
    <div className="border-grid sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 h-mobile-nav flex justify-center">
      <div className="grid grid-cols-7 gap-2 items-center justify-center px-2">
        {daysInCurrentWeek.map((day, i) => (
          <Button variant="secondary" asChild className="h-auto flex-col gap-0">
            <Link
              to="/"
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
      </div>
    </div>
  );
}

export function useDisplayMobileNav() {
  const isMobile = useIsMobile();
  return isMobile;
}

export const mobileNavEditorClass = "scroll-mt-mobile-nav";
