import { useNavigate, useLocation } from "@tanstack/react-router";
import { formatISO } from "date-fns";
import { useEffect, useMemo, useState } from "react";
import { Calendar } from "./ui/calendar";
import { SidebarGroup, SidebarGroupContent } from "./ui/sidebar";

/**
 * TODO: explain behaviour
 */
export function CalendarNavigation() {
  const navigate = useNavigate();
  const location = useLocation();

  const dateValue = useMemo(() => {
    if (location.pathname !== "/" || !location.search.date) {
      return undefined;
    }

    return new Date(location.search.date);
  }, [location]);

  // Manage the currently displayed month in the calendar
  const [currentMonth, setCurrentMonth] = useState<Date | undefined>(undefined);

  // Update the displayed month whenever the dateValue changes
  // This ensures the calendar shows the month of the selected date
  useEffect(() => {
    if (dateValue) {
      setCurrentMonth(dateValue);
    }
  }, [dateValue]);

  return (
    <SidebarGroup className="px-0">
      <SidebarGroupContent>
        <Calendar
          mode="single"
          selected={dateValue}
          month={currentMonth}
          onMonthChange={setCurrentMonth}
          onSelect={(date) => {
            if (!date) {
              return;
            }
            const dateString = formatISO(date, {
              representation: "date",
            });
            navigate({
              to: "/",
              search: { date: dateString },
            });
          }}
          className="[&_[role=gridcell]]:w-[33px]"
        />
      </SidebarGroupContent>
    </SidebarGroup>
  );
}
