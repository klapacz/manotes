import { batch, createMemo, createSignal } from "solid-js";
import { Intl, Temporal } from "temporal-polyfill";
import type {
  DateFieldState,
  DateSegment,
  DateValue,
  EditableSegment,
  FieldOptions,
  FieldValue,
  Granularity,
  SegmentType,
  TimeValue,
} from "./types";

export type {
  DateFieldState,
  DateSegment,
  DateValue,
  FieldOptions,
  Granularity,
  SegmentType,
  TimeValue,
} from "./types";

export function createDateFieldState<T extends DateValue = Temporal.PlainDate>(
  props: FieldOptions<T>,
): DateFieldState<T> {
  return createFieldState(props, "date");
}

export function createTimeFieldState<T extends TimeValue = Temporal.PlainTime>(
  props: FieldOptions<T>,
): DateFieldState<T> {
  return createFieldState(props, "time");
}

function createFieldState<T extends FieldValue>(
  props: FieldOptions<T>,
  mode: "date" | "time",
): DateFieldState<T> {
  const initial = props.defaultValue ?? null;
  const [internalValue, setInternalValue] = createSignal<T | null>(initial);
  const value = () => (props.value !== undefined ? props.value : internalValue());

  // SAFETY: The default subtype is selected by mode; other subtypes require a value or placeholder.
  const fallback = (
    mode === "time" ? new Temporal.PlainTime() : new Temporal.PlainDate(2000, 1, 1)
  ) as T;

  let lastTemplate = props.value ?? props.placeholderValue ?? initial ?? fallback;

  const template = () => {
    const current = value();

    if (current) lastTemplate = current;

    return current ?? props.placeholderValue ?? lastTemplate;
  };

  const [draft, setDraft] = createSignal<T>(template());
  const [filled, setFilled] = createSignal<ReadonlySet<EditableSegment>>(new Set());
  const [editing, setEditing] = createSignal(false);
  const [source, setSource] = createSignal<T | null>(value());
  let requestedDay: number | undefined;

  const granularity = (): Granularity => {
    return props.granularity ?? (mode === "time" || "hour" in template() ? "minute" : "day");
  };

  const displayValue = createMemo(() => {
    if (source() !== value()) {
      requestedDay = undefined;
      batch(() => {
        setSource(() => value());
        setDraft(() => template());
        setFilled(new Set<EditableSegment>());
        setEditing(false);
      });
    }

    return editing() && value() === null ? draft() : template();
  });

  const formatter = createMemo(() => {
    return new Intl.DateTimeFormat(
      props.locale ?? "en-US",
      formatOptions(displayValue(), mode, granularity(), props.hourCycle, props.hideTimeZone),
    );
  });

  const hour12 = () => formatter().resolvedOptions().hour12 ?? false;

  const segments = createMemo(() => {
    const current = displayValue();

    const parts = formatter().formatToParts(
      current instanceof Temporal.ZonedDateTime ? current.toInstant() : current,
    );

    return parts.map((part): DateSegment => {
      const type = segmentType(part.type);

      if (!isEditable(type)) {
        return { type, text: part.value, isEditable: false, isPlaceholder: false };
      }

      const limits = segmentLimits(current, type, hour12());
      const isPlaceholder = value() === null && !filled().has(type);

      return {
        type,
        text: isPlaceholder && type !== "dayPeriod" ? placeholders[type] : part.value,
        value: isPlaceholder ? undefined : segmentValue(current, type, hour12()),
        minValue: limits[0],
        maxValue: limits[1],
        isEditable: true,
        isPlaceholder,
      };
    });
  });

  const editableTypes = () => {
    return segments().flatMap((segment) => (isEditable(segment.type) ? [segment.type] : []));
  };

  const mutable = () => !props.isDisabled && !props.isReadOnly;

  function emit(next: T | null) {
    if (equalValues(value(), next)) return;

    if (props.value === undefined) setInternalValue(() => next);
    props.onChange?.(next);
    setSource(() => value());
  }

  function setValue(next: T | null) {
    if (!mutable()) return;
    requestedDay = undefined;
    batch(() => {
      setDraft(() => next ?? template());
      setEditing(false);
      setFilled(new Set<EditableSegment>());
      emit(next);
    });
  }

  function setSegment(type: SegmentType, next: number) {
    if (!mutable() || !isEditable(type) || !Number.isInteger(next)) return;

    if (!segments().some((segment) => segment.type === type && segment.isEditable)) return;
    const current = displayValue();
    const [min, max] = segmentLimits(current, type, hour12());
    next = Math.max(min, Math.min(max, next));

    if (type === "day") requestedDay = next;

    if (type === "month") requestedDay = undefined;

    if (type === "year" && "day" in current) requestedDay ??= current.day;
    let fields: Temporal.PlainDateTimeLike;

    if (type === "dayPeriod" && "hour" in current) {
      fields = { hour: (current.hour % 12) + next * 12 };
    } else if (type === "hour" && hour12() && "hour" in current) {
      fields = { hour: (next % 12) + (current.hour >= 12 ? 12 : 0) };
    } else fields = { [type]: next };
    let changed = current.with(fields);

    // Keep February 29 while a typed year passes through non-leap prefixes such as 2 and 20.
    if (type === "year" && requestedDay !== undefined && "day" in changed) {
      changed = changed.with({ day: requestedDay });
    }

    // SAFETY: Temporal.with preserves the receiver's subtype, calendar, and time zone.
    commitSegment(type, changed as T);
  }

  function commitSegment(type: EditableSegment, changed: T) {
    batch(() => {
      const nextFilled = new Set(value() !== null ? editableTypes() : filled());
      nextFilled.add(type);

      if (type === "hour" && editableTypes().includes("dayPeriod")) nextFilled.add("dayPeriod");
      setDraft(() => changed);
      setEditing(true);
      setFilled(nextFilled);

      if (editableTypes().every((key) => nextFilled.has(key))) emit(changed);
    });
  }

  function clearSegment(type: SegmentType) {
    if (!mutable() || !isEditable(type)) return;

    if (!segments().some((segment) => segment.type === type && segment.isEditable)) return;

    if (type === "day") requestedDay = undefined;
    const current = displayValue();
    const nextFilled = new Set(value() !== null ? editableTypes() : filled());
    nextFilled.delete(type);
    batch(() => {
      setDraft(() => current);
      setEditing(true);
      setFilled(nextFilled);
      emit(null);
    });
  }

  function increment(type: SegmentType, amount = 1) {
    if (!mutable() || !isEditable(type)) return;
    const current = displayValue();
    const [min, max] = segmentLimits(current, type, hour12());
    const segment = segments().find((segment) => segment.type === type);

    if (segment?.isPlaceholder) {
      setSegment(type, segmentValue(props.placeholderValue ?? fallback, type, hour12()));

      return;
    }

    if (current instanceof Temporal.ZonedDateTime && type === "hour") {
      const changed = current.add({ hours: amount });

      if (
        changed.toPlainDate().equals(current.toPlainDate()) &&
        (!hour12() || Math.floor(changed.hour / 12) === Math.floor(current.hour / 12))
      ) {
        // SAFETY: Adding hours preserves the ZonedDateTime subtype of the current T.
        commitSegment(type, changed as T);

        return;
      }
    }

    const next = min + modulo(segmentValue(current, type, hour12()) - min + amount, max - min + 1);
    setSegment(type, next);
  }

  const validationErrors = createMemo(() => {
    const current = value();
    const errors: string[] = [];

    if (props.isRequired && current === null) errors.push("A value is required.");

    if (current) {
      if (props.minValue && compare(current, props.minValue, mode) < 0) {
        errors.push("Value is before the minimum.");
      }

      if (props.maxValue && compare(current, props.maxValue, mode) > 0) {
        errors.push("Value is after the maximum.");
      }

      if ("day" in current && props.isDateUnavailable?.(toPlainDate(current))) {
        errors.push("This date is unavailable.");
      }

      const error = props.validate?.(current);

      if (error) errors.push(error);
    }

    return errors;
  });

  return {
    value,
    displayValue,
    segments,
    granularity,
    validationErrors,
    isInvalid: () => !!props.isInvalid || validationErrors().length > 0,
    isDisabled: () => props.isDisabled ?? false,
    isReadOnly: () => props.isReadOnly ?? false,
    isRequired: () => props.isRequired ?? false,
    setValue,
    setSegment,
    clearSegment,
    increment,
    decrement: (type, amount = 1) => increment(type, -amount),
    incrementPage: (type, direction = 1) => {
      if (!isEditable(type)) return;
      const step = pageSteps[type];
      const current = segmentValue(displayValue(), type, hour12());

      const rounded =
        direction > 0
          ? (Math.floor(current / step) + 1) * step
          : (Math.ceil(current / step) - 1) * step;

      increment(type, rounded - current);
    },
    setSegmentToLimit: (type, limit) => {
      if (type === "hour" && hour12()) {
        setSegment(type, limit === "min" ? 12 : 11);

        return;
      }

      if (isEditable(type)) {
        setSegment(type, segmentLimits(displayValue(), type, hour12())[limit === "min" ? 0 : 1]);
      }
    },
    confirmPlaceholder: () => {
      if (value() !== null || editableTypes().every((type) => filled().has(type))) {
        setValue(displayValue());
      }
    },
    reset: () => {
      requestedDay = undefined;
      lastTemplate = initial ?? props.placeholderValue ?? fallback;
      batch(() => {
        setDraft(() => lastTemplate);
        setFilled(new Set<EditableSegment>());
        setEditing(false);
        emit(initial);
      });
    },
  };
}

const placeholders: Record<EditableSegment, string> = {
  year: "yyyy",
  month: "mm",
  day: "dd",
  hour: "––",
  minute: "––",
  second: "––",
  dayPeriod: "AM",
};

const pageSteps: Record<EditableSegment, number> = {
  year: 5,
  month: 2,
  day: 7,
  hour: 2,
  minute: 15,
  second: 15,
  dayPeriod: 1,
};

function formatOptions(
  value: FieldValue,
  mode: "date" | "time",
  granularity: Granularity,
  hourCycle?: 12 | 24,
  hideTimeZone?: boolean,
): globalThis.Intl.DateTimeFormatOptions {
  const options: globalThis.Intl.DateTimeFormatOptions = {};

  if (mode === "date") {
    options.year = "numeric";
    options.month = "2-digit";
    options.day = "2-digit";
  }

  if (granularity !== "day") {
    if (!("hour" in value)) {
      throw new RangeError("Time granularity requires a Temporal date-time or time value.");
    }

    options.hour = "numeric";

    if (granularity !== "hour") options.minute = "2-digit";

    if (granularity === "second") options.second = "2-digit";

    if (hourCycle) options.hourCycle = hourCycle === 12 ? "h12" : "h23";
  }

  if ("calendarId" in value) {
    options.calendar = value.calendarId === "iso8601" ? "gregory" : value.calendarId;
  }

  if (value instanceof Temporal.ZonedDateTime) {
    options.timeZone = value.timeZoneId;

    if (!hideTimeZone && granularity !== "day") options.timeZoneName = "short";
  }

  return options;
}

export function isEditable(type: SegmentType) {
  return (
    type === "year" ||
    type === "month" ||
    type === "day" ||
    type === "hour" ||
    type === "minute" ||
    type === "second" ||
    type === "dayPeriod"
  );
}

function segmentType(type: string): SegmentType {
  switch (type) {
    case "year":
    case "month":
    case "day":
    case "hour":
    case "minute":
    case "second":
    case "dayPeriod":
    case "era":
    case "timeZoneName":
      return type;
    case "relatedYear":
      return "year";
    default:
      return "literal";
  }
}

function segmentLimits(
  value: FieldValue,
  type: EditableSegment,
  hour12: boolean,
): [number, number] {
  switch (type) {
    case "year":
      return [1, 9999];
    case "month":
      return [1, "monthsInYear" in value ? value.monthsInYear : 12];
    case "day":
      return [1, "daysInMonth" in value ? value.daysInMonth : 31];
    case "hour":
      return hour12 ? [1, 12] : [0, 23];
    case "minute":
    case "second":
      return [0, 59];
    case "dayPeriod":
      return [0, 1];
  }
}

function segmentValue(value: FieldValue, type: EditableSegment, hour12: boolean): number {
  switch (type) {
    case "year":
    case "month":
    case "day":
      return "day" in value ? value[type] : 1;
    case "hour":
      return "hour" in value ? (hour12 ? value.hour % 12 || 12 : value.hour) : 0;
    case "minute":
    case "second":
      return "hour" in value ? value[type] : 0;
    case "dayPeriod":
      return "hour" in value && value.hour >= 12 ? 1 : 0;
  }
}

function modulo(value: number, size: number): number {
  return ((value % size) + size) % size;
}

function equalValues(left: FieldValue | null, right: FieldValue | null): boolean {
  return (
    left === right || (left !== null && right !== null && left.toString() === right.toString())
  );
}

export function toPlainDate(value: DateValue): Temporal.PlainDate {
  return value instanceof Temporal.PlainDate ? value : value.toPlainDate();
}

export function compare(left: FieldValue, right: FieldValue, mode: "date" | "time"): number {
  if (mode === "time" && "hour" in left && "hour" in right) {
    return Temporal.PlainTime.compare(
      left instanceof Temporal.PlainTime ? left : left.toPlainTime(),
      right instanceof Temporal.PlainTime ? right : right.toPlainTime(),
    );
  }

  if (left instanceof Temporal.ZonedDateTime && right instanceof Temporal.ZonedDateTime) {
    return Temporal.ZonedDateTime.compare(left, right);
  }

  if (left instanceof Temporal.PlainDateTime && right instanceof Temporal.PlainDateTime) {
    return Temporal.PlainDateTime.compare(left, right);
  }

  if ("day" in left && "day" in right) {
    return Temporal.PlainDate.compare(toPlainDate(left), toPlainDate(right));
  }

  throw new RangeError("Bounds must have the same kind of value as the field.");
}
