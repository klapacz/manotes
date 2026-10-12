import type { Accessor } from "solid-js";
import type { Temporal } from "temporal-polyfill";

export type DateValue = Temporal.PlainDate | Temporal.PlainDateTime | Temporal.ZonedDateTime;

export type TimeValue = Temporal.PlainTime | Temporal.PlainDateTime | Temporal.ZonedDateTime;

export type FieldValue = DateValue | Temporal.PlainTime;

export type Granularity = "day" | "hour" | "minute" | "second";

export type EditableSegment = "year" | "month" | "day" | "hour" | "minute" | "second" | "dayPeriod";

export type SegmentType = EditableSegment | "literal" | "era" | "timeZoneName";

export interface DateSegment {
  type: SegmentType;
  text: string;
  value?: number;
  minValue?: number;
  maxValue?: number;
  isPlaceholder: boolean;
  isEditable: boolean;
}

export interface FieldOptions<T extends FieldValue> {
  value?: T | null;
  defaultValue?: T | null;
  onChange?: (value: T | null) => void;
  placeholderValue?: T;
  locale?: string;
  hourCycle?: 12 | 24;
  granularity?: Granularity;
  hideTimeZone?: boolean;
  minValue?: T;
  maxValue?: T;
  isDisabled?: boolean;
  isReadOnly?: boolean;
  isRequired?: boolean;
  isInvalid?: boolean;
  isDateUnavailable?: (date: Temporal.PlainDate) => boolean;
  validate?: (value: T) => string | undefined;
}

export interface DateFieldState<T extends FieldValue> {
  value: Accessor<T | null>;
  displayValue: Accessor<T>;
  segments: Accessor<DateSegment[]>;
  granularity: Accessor<Granularity>;
  isInvalid: Accessor<boolean>;
  validationErrors: Accessor<string[]>;
  isDisabled: Accessor<boolean>;
  isReadOnly: Accessor<boolean>;
  isRequired: Accessor<boolean>;
  setValue: (value: T | null) => void;
  setSegment: (type: SegmentType, value: number) => void;
  clearSegment: (type: SegmentType) => void;
  increment: (type: SegmentType, amount?: number) => void;
  decrement: (type: SegmentType, amount?: number) => void;
  incrementPage: (type: SegmentType, direction?: 1 | -1) => void;
  setSegmentToLimit: (type: SegmentType, limit: "min" | "max") => void;
  confirmPlaceholder: () => void;
  reset: () => void;
}
