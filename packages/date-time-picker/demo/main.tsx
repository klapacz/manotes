import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { DateField, DatePicker, DateRangePicker, RangeCalendar, TimeField } from "../src";
import type { DateRange } from "../src";
import "./style.css";

function Demo() {
  const [date, setDate] = createSignal<Temporal.PlainDate | null>(
    Temporal.PlainDate.from("2024-10-12"),
  );

  const [time, setTime] = createSignal<Temporal.PlainTime | null>(Temporal.PlainTime.from("15:30"));

  const [meeting, setMeeting] = createSignal<Temporal.ZonedDateTime | null>(
    Temporal.ZonedDateTime.from("2024-10-12T15:30+02:00[Europe/Warsaw]"),
  );

  const [locale, setLocale] = createSignal("en-US");

  const [trip, setTrip] = createSignal<DateRange | null>({
    start: Temporal.PlainDate.from("2024-10-12"),
    end: Temporal.PlainDate.from("2024-10-18"),
  });

  return (
    <main>
      <p class="eyebrow">Manotes · component workshop</p>
      <h1>Date and time, with Temporal</h1>
      <p>Type into each segment or use the arrow keys. Open the calendar to choose a day.</p>
      <label class="locale">
        Locale{" "}
        <select value={locale()} onChange={(event) => setLocale(event.currentTarget.value)}>
          <option value="en-US">English · US</option>
          <option value="pl-PL">Polski</option>
          <option value="de-DE">Deutsch</option>
          <option value="ar-EG">العربية</option>
        </select>
      </label>
      <div class="examples" dir={locale() === "ar-EG" ? "rtl" : "ltr"}>
        <section>
          <h2>Date picker</h2>
          <DatePicker
            label="Note date"
            locale={locale()}
            value={date()}
            onChange={setDate}
            description="A calendar date, without a time zone."
            name="date"
          />
          <output>{date()?.toString() ?? "No date"}</output>
        </section>
        <section>
          <h2>Date range picker</h2>
          <DateRangePicker
            label="Trip"
            locale={locale()}
            value={trip()}
            onChange={setTrip}
            description="Open the calendar and choose two days, or edit each endpoint."
          />
          <output>
            {trip()
              ? `${trip()!.start.toString()} / ${trip()!.end.toString()}`
              : "Incomplete range"}
          </output>
        </section>
        <section>
          <h2>Time field</h2>
          <TimeField
            label="Reminder time"
            locale={locale()}
            value={time()}
            onChange={setTime}
            description="A clock time. Midnight and noon use the locale's hour cycle."
            name="time"
          />
          <output>{time()?.toString() ?? "No time"}</output>
        </section>
        <section>
          <h2>Zoned date and time</h2>
          <DatePicker
            label="Meeting"
            locale={locale()}
            value={meeting()}
            onChange={setMeeting}
            placeholderValue={Temporal.ZonedDateTime.from("2024-10-12T15:30+02:00[Europe/Warsaw]")}
            description="Europe/Warsaw. Changing the date preserves the clock time and resolves daylight saving."
          />
          <output>{meeting()?.toString() ?? "No meeting"}</output>
        </section>
        <section>
          <h2>Empty, required field</h2>
          <DateField
            label="Deadline"
            locale={locale()}
            isRequired
            description="All date segments must be entered before a value is committed."
          />
        </section>
        <section>
          <h2>Date constraints</h2>
          <DatePicker
            label="October appointment"
            locale={locale()}
            defaultValue={Temporal.PlainDate.from("2024-10-12")}
            minValue={Temporal.PlainDate.from("2024-10-10")}
            maxValue={Temporal.PlainDate.from("2024-10-25")}
            isDateUnavailable={(date) => date.dayOfWeek > 5}
            description="October 10–25. Weekends are unavailable."
          />
        </section>
        <section>
          <h2>Form reset</h2>
          <form>
            <TimeField
              label="Start time"
              locale={locale()}
              name="start"
              hourCycle={24}
              defaultValue={Temporal.PlainTime.from("08:30")}
            />
            <button type="reset">Reset to 08:30</button>
          </form>
        </section>
        <section>
          <h2>Date-time range</h2>
          <form>
            <DateRangePicker
              label="Booking"
              locale={locale()}
              startName="booking-start"
              endName="booking-end"
              isRequired
              defaultValue={{
                start: Temporal.PlainDateTime.from("2024-10-12T09:30"),
                end: Temporal.PlainDateTime.from("2024-10-12T17:00"),
              }}
              description="Dates and times are independently editable. Reset restores both endpoints."
            />
            <button type="reset">Reset booking</button>
          </form>
        </section>
        <section>
          <h2>Range calendar</h2>
          <RangeCalendar
            label="Availability"
            locale={locale()}
            defaultValue={{
              start: Temporal.PlainDate.from("2024-10-14"),
              end: Temporal.PlainDate.from("2024-10-18"),
            }}
            minValue={Temporal.PlainDate.from("2024-10-01")}
            maxValue={Temporal.PlainDate.from("2024-11-30")}
            isDateUnavailable={(date) => date.dayOfWeek > 5}
          />
          <p>
            Choose a start and end. Weekends are unavailable, so ranges stay within one working
            week.
          </p>
        </section>
        <section>
          <h2>Empty range picker</h2>
          <DateRangePicker label="New trip" locale={locale()} />
        </section>
      </div>
    </main>
  );
}

const root = document.getElementById("root");

if (!root) throw new Error("Demo root is missing");

render(() => <Demo />, root);
