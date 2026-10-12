import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import type { PropRecordRepo } from "@manotes/shared/prop-record.repo";
import type { NoteRepo } from "@manotes/shared/note.repo";
import { EnumOptionRepo } from "@manotes/shared/enum-option.repo";
import { Match, Option, pipe, Schema, Stream, String, Types } from "effect";
import { MenuQuery } from "../../lib/menu-query";
import { QueryEngine } from "../../lib/query-engine";
import type { Picker } from "../ui/picker";
import { StreamFilter } from "@manotes/shared/note/stream-filter";
import { NoteQuery } from "./note-query";

export const editableTypes = ["bool", "number", "text", "link", "enum"] as const;

export type EditableType = (typeof editableTypes)[number];

export type Def = PropRecordRepo.Def<EditableType>;

export const editableDef = Match.type<PropRecordRepo.Def>().pipe(
  Match.when({ prop_type: Match.is(...editableTypes) }, (def) => def),
  Match.result,
);

type Choice = Picker.Choice & { propVal: AttrsSchema.PropVal };

export function values(opts: {
  propId: AttrsSchema.NoteId;
  type: EditableType;
  targets: AttrsSchema.TargetFilter | undefined;
  defaultValue: Option.Option<AttrsSchema.PropVal>;
}): QueryEngine.Query<Choice, unknown, NoteRepo.Service | EnumOptionRepo.Service> {
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
    Match.when("text", () =>
      textQuery({
        defaultValue: opts.defaultValue.pipe(Option.filter(AttrsSchema.PropVal.guards.text)),
      }),
    ),
    Match.when("link", () =>
      linkQuery({
        targets: opts.targets,
        defaultValue: opts.defaultValue.pipe(Option.filter(AttrsSchema.PropVal.guards.link)),
      }),
    ),
    Match.when("enum", () =>
      enumQuery({
        propId: opts.propId,
        defaultValue: opts.defaultValue.pipe(Option.filter(AttrsSchema.PropVal.guards.enum)),
      }),
    ),
    Match.exhaustive,
  );
}

export function targets(def: Def): AttrsSchema.TargetFilter | undefined {
  if (def.prop_type !== "link") return undefined;

  return def.prop_targets ?? undefined;
}

export function enumQuery(opts: {
  propId: AttrsSchema.NoteId;
  defaultValue: Option.Option<Types.ExtractTag<AttrsSchema.PropVal, "enum">>;
}): QueryEngine.Query<Choice, unknown, EnumOptionRepo.Service> {
  return (request) =>
    Stream.unwrap(
      EnumOptionRepo.Service.use((repo) => repo.reactiveOptions({ enum_parent: opts.propId })),
    ).pipe(
      Stream.map((options) =>
        options.flatMap((option) => {
          const label = NoteQuery.label(option, request.text);
          const score = QueryEngine.score({ text: request.text, label });

          if (!score) return [];

          const propVal = AttrsSchema.PropVal.cases.enum.make({ val: option.id });

          return [
            {
              score,
              value: {
                value: option.id,
                label,
                propVal,
                detail: Option.contains(opts.defaultValue, propVal) ? () => "Default" : undefined,
              },
            },
          ];
        }),
      ),
    );
}

export function linkQuery(opts: {
  targets: AttrsSchema.TargetFilter | undefined;
  defaultValue: Option.Option<Types.ExtractTag<AttrsSchema.PropVal, "link">>;
}) {
  const query = NoteQuery.scoped({ filter: StreamFilter.fromAttrs(opts.targets) });

  return QueryEngine.map(query, (note) => {
    const propVal = AttrsSchema.PropVal.cases.link.make({ val: note.value });
    const isDefault = opts.defaultValue.pipe(Option.contains(propVal));

    return {
      ...note,
      propVal,
      detail: isDefault ? () => "Default" : undefined,
    };
  });
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

export function textQuery(opts: {
  defaultValue: Option.Option<Types.ExtractTag<AttrsSchema.PropVal, "text">>;
}): QueryEngine.Query<Choice> {
  return (request) =>
    Stream.sync(() =>
      pipe(
        request.text,
        Option.liftPredicate(String.isNonEmpty),
        Option.match({
          onNone: () => opts.defaultValue,
          onSome: (val) => Option.some(AttrsSchema.PropVal.cases.text.make({ val })),
        }),
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
  return Match.value(value).pipe(
    Match.tag("bool", ({ val }) => (val ? "True" : "False")),
    Match.tag("number", ({ val }) => val.toString()),
    Match.tag("text", ({ val }) => {
      if (String.isEmpty(val)) {
        return '""';
      }

      return val;
    }),
    Match.tag("enum", () => "Enum option"),
    // Reference labels are resolved reactively by PropPicker.ValueLabel.
    Match.tag("link", () => "Reference"),
    Match.exhaustive,
  );
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
