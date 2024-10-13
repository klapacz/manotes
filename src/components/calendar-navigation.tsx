import { cn } from "@/lib/utils";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { formatISO } from "date-fns";
import { useMemo } from "react";
import { Calendar } from "./ui/calendar";

type CalendarNavigationProps = {
  className?: string;
};

/**
 * TODO: explain behaviour
 */
export function CalendarNavigation(props: CalendarNavigationProps) {
  const navigate = useNavigate();
  const location = useLocation();

  const dateValue = useMemo(() => {
    if (location.pathname !== "/" || !location.search.date) {
      return undefined;
    }

    return new Date(location.search.date);
  }, [location]);

  return (
    <Calendar
      mode="single"
      selected={dateValue}
      onSelect={(date) => {
        if (!date) {
          return;
        }
        const dateString = formatISO(date, {
          representation: "date",
        });
        navigate({
          to: "/",
          search: (prev) => ({ date: dateString }),
        });
      }}
      className={cn(props.className)}
    />
  );
}
