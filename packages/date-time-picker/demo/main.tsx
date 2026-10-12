import { render } from "solid-js/web";
import { createSignal } from "solid-js";
import { Temporal } from "temporal-polyfill";
import { DateField, DatePicker, TimeField } from "../src";
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
      </div>
    </main>
  );
}

const root = document.getElementById("root");

if (!root) throw new Error("Demo root is missing");

render(() => <Demo />, root);
