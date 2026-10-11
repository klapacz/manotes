import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import type { PropRecordRepo } from "@manotes/shared/prop-record.repo";
import { Match, Option, pipe, Schema, Stream, String, Types } from "effect";
import { MenuQuery } from "../../lib/menu-query";
import { QueryEngine } from "../../lib/query-engine";
import type { Picker } from "../ui/picker";

export const editableTypes = ["bool", "number"] as const;

export type EditableType = (typeof editableTypes)[number];

export type Def = PropRecordRepo.Def<EditableType>;

export const editableDef = Match.type<PropRecordRepo.Def>().pipe(
  Match.when({ prop_type: Match.is(...editableTypes) }, (def) => def),
  Match.result,
);

type Choice = Picker.Choice & { propVal: AttrsSchema.PropVal };

export function values(opts: {
  type: EditableType;
  defaultValue: Option.Option<AttrsSchema.PropVal>;
}): QueryEngine.Query<Choice> {
  return Match.value(opts.type).pipe(
    Match.when("bool", () =>
      boolQuery({
        defaultValue: opts.defaultValue.pipe(Option.filter(AttrsSchema.PropVal.guards.bool)),
      }),
    ),
    Match.when("number", () =>
      numberQuery({
        defaultValue: opts.defaultValue.pipe(Option.filter(AttrsSchema.PropVal.guards.number)),
      }),
    ),
    Match.exhaustive,
  );
}

export function boolQuery(opts: {
  defaultValue: Option.Option<Types.ExtractTag<AttrsSchema.PropVal, "bool">>;
}) {
  return MenuQuery.choices(() =>
    [true, false].map((val) => {
      const propVal = AttrsSchema.PropVal.cases.bool.make({ val });
      const label = valueLabel(propVal);
      const isDefault = opts.defaultValue.pipe(Option.contains(propVal));

      return {
        value: label,
        label,
        propVal,
        detail: isDefault ? () => "Default" : undefined,
      };
    }),
  );
}

export function numberQuery(opts: {
  defaultValue: Option.Option<Types.ExtractTag<AttrsSchema.PropVal, "number">>;
}): QueryEngine.Query<Choice> {
  return (request) =>
    Stream.sync(() =>
      pipe(
        request.text,
        String.trim,
        Option.liftPredicate(String.isNonEmpty),
        Option.match({ onNone: () => opts.defaultValue, onSome: parseNumber }),
        Option.map((propVal) => {
          const label = valueLabel(propVal);
          const isDefault = opts.defaultValue.pipe(Option.contains(propVal));

          return [
            {
              score: 1,
              value: {
                value: label,
                label,
                propVal,
                detail: isDefault ? () => "Default" : undefined,
              },
            },
          ];
        }),
        Option.getOrElse(() => []),
      ),
    );
}

export function parseNumber(text: string) {
  return pipe(
    text,
    String.trim,
    Option.liftPredicate(String.isNonEmpty),
    Option.flatMap(Schema.decodeOption(Schema.FiniteFromString)),
    Option.map((val) => AttrsSchema.PropVal.cases.number.make({ val })),
  );
}

export function valueLabel(value: AttrsSchema.PropVal): string {
  if (AttrsSchema.PropVal.guards.bool(value)) {
    return value.val ? "True" : "False";
  }

  return value.val.toString();
}

export function valueState(opts: {
  type: AttrsSchema.PropValTag;
  value: Option.Option<AttrsSchema.PropVal>;
}): Attrs.ValueState<AttrsSchema.PropVal> {
  return opts.value.pipe(
    Option.map((value) => {
      if (AttrsSchema.PropVal.guards[opts.type](value)) {
        return Attrs.ValueState.Valid({ value });
      }

      return Attrs.ValueState.Invalid({ value });
    }),
    Option.getOrElse(() => Attrs.ValueState.Unset()),
  );
}

export function stateLabel(state: Attrs.ValueState<AttrsSchema.PropVal>): string {
  return Match.value(state).pipe(
    Match.tag("Unset", () => "Choose"),
    Match.tag("Valid", ({ value }) => valueLabel(value)),
    Match.tag("Invalid", ({ value }) =>
      Option.fromNullishOr(value).pipe(
        Option.map(valueLabel),
        Option.map((label) => `Invalid: ${label}`),
        Option.getOrElse(() => "Invalid"),
      ),
    ),
    Match.exhaustive,
  );
}

export * as PropQuery from "./prop-query";
