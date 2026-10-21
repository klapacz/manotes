/**
 * Only the public API was checked. The implementation has not been carefully reviewed.
 * AI agents must notify the user of this review gap before working on this file.
 * @module
 */
import { Array, Data, Equal, identity, Match, Option, Predicate, Result, Schema } from "effect";
import { AttrsSchema } from "../attrs.schema";
import { BuiltinAttrs } from "../builtin-attrs";
import { PlainDateString } from "../temporal.schema";

export type Label = Data.TaggedEnum<{
  Literal: { val: string };
  Record: { id: AttrsSchema.RecordId; val: (name: string) => string };
  Parts: { val: readonly Label[] };
  Value: { val: AttrsSchema.PropVal };
}>;

export const Label = Data.taggedEnum<Label>();

export type DisplayLabel = string | Label;

export function renderLabel(
  label: DisplayLabel,
  recordName: (id: AttrsSchema.RecordId) => string = identity,
): string {
  if (Predicate.isString(label)) return label;

  return Match.value(label).pipe(
    Match.tag("Literal", ({ val }) => val),
    Match.tag("Record", ({ id, val }) => {
      // TODO: Revisit resolving builtin and user-defined record names through the same path.
      return val(
        Option.match(BuiltinAttrs.find(id), {
          onNone: () => recordName(id),
          onSome: (def) => def.title ?? "Untitled property",
        }),
      );
    }),
    Match.tag("Parts", ({ val }) => {
      return Array.map(val, (part) => renderLabel(part, recordName)).join("");
    }),
    Match.tag("Value", ({ val }) => {
      return Match.value(val).pipe(
        Match.tag("link", "enum", ({ val }) => {
          return renderLabel(Label.Record({ id: val, val: identity }), recordName);
        }),
        Match.tag("bool", ({ val }) => (val ? "True" : "False")),
        Match.tag("text", ({ val }) => (val === "" ? '""' : val)),
        Match.tag("number", ({ val }) => String(val)),
        Match.exhaustive,
      );
    }),
    Match.exhaustive,
  );
}

export function labelRecords(label: DisplayLabel): readonly AttrsSchema.RecordId[] {
  if (Predicate.isString(label)) return [];

  return Match.value(label).pipe(
    Match.tag("Literal", () => []),
    Match.tag("Record", ({ id }) => (Option.isSome(BuiltinAttrs.find(id)) ? [] : [id])),
    Match.tag("Parts", ({ val }) => Array.dedupe(Array.flatMap(val, labelRecords))),
    Match.tag("Value", ({ val }) => {
      return Match.value(val).pipe(
        Match.tag("link", "enum", ({ val }) => {
          return labelRecords(Label.Record({ id: val, val: identity }));
        }),
        Match.orElse(() => []),
      );
    }),
    Match.exhaustive,
  );
}

export type PickerValue = string | number | boolean | undefined;

type FilterValue = AttrsSchema.FilterCmp[2];

type PickerKind = Data.TaggedEnum<{
  Text: {};
  Number: {};
  Date: {};
  Record: { filter: AttrsSchema.TargetFilter };
  Choices: {
    groups: readonly { label: string; choices: readonly { label: string; value: PickerValue }[] }[];
  };
}>;

const pickerKind = Data.taggedEnum<PickerKind>();

type PickerOptions = { label: DisplayLabel; defaultValue?: PickerValue };

export type Picker<Value = FilterValue> = PickerKind &
  PickerOptions & {
    map: (raw: PickerValue) => Option.Option<Value>;
    unmap: (value: FilterValue) => Option.Option<PickerValue>;
  };

type Adapt<Raw extends PickerValue, Value> = {
  map: (raw: Raw) => Value;
  unmap: (value: FilterValue) => Option.Option<Raw>;
};

export const Picker = {
  Text: scalarPicker(pickerKind.Text(), Schema.String),
  Number: scalarPicker(pickerKind.Number(), Schema.Finite),
  Date: scalarPicker(pickerKind.Date(), PlainDateString),
  Record: recordPicker,
  Choices: choicesPicker,
};

type EntryPicker = PickerKind & PickerOptions;

type EntryFields = {
  select: (raw: PickerValue) => Option.Option<AttrsSchema.TargetFilterExpr>;
  getLabel: (expression: AttrsSchema.FilterExpr) => Option.Option<Label>;
  selection: (expression: AttrsSchema.FilterExpr) => Option.Option<PickerValue>;
};

export type Comparison = EntryFields & { readonly _tag: "Comparison"; picker: EntryPicker };

export type Named = EntryFields & { readonly _tag: "Named"; family?: symbol; picker?: EntryPicker };

export type Definition = Comparison | Named;

const entryTag = Data.taggedEnum<Data.TaggedEnum<{ Comparison: {}; Named: {} }>>();

type Pattern = Match.Types.PatternBase<AttrsSchema.FilterCmp>;

export function comparison<Value, Cmp extends AttrsSchema.TargetFilterCmp>(opts: {
  when: Pattern;
  make: (value: Value) => Cmp;
  getLabel: (cmp: Cmp) => Label;
  getValue?: (cmp: Cmp) => FilterValue;
  picker: Picker<Value>;
}) {
  const match = (expression: AttrsSchema.FilterExpr): Option.Option<Cmp> => {
    const matched = Match.value(expression).pipe(
      Match.tag("cmp", ({ val }) => {
        return Match.value(val).pipe(Match.when(opts.when, identity), Match.option);
      }),
      Match.orElse(() => Option.none()),
    );

    // SAFETY: The registration's when pattern describes the tuple returned by make.
    return matched as Option.Option<Cmp>;
  };

  const make = (value: Value) => AttrsSchema.makeTargetFilterExpr.cmp({ val: opts.make(value) });

  return {
    ...entryTag.Comparison(),
    picker: opts.picker,
    make,
    select: (raw: PickerValue) => {
      return Option.map(opts.picker.map(raw), make);
    },
    getLabel: (expression: AttrsSchema.FilterExpr) => Option.map(match(expression), opts.getLabel),
    selection: (expression: AttrsSchema.FilterExpr) => {
      return Option.flatMap(match(expression), (cmp) => {
        return opts.picker.unmap(opts.getValue ? opts.getValue(cmp) : cmp[2]);
      });
    },
  };
}

export function family(label: string): symbol {
  return Symbol(label);
}

export function named(opts: {
  family?: symbol;
  expression: AttrsSchema.TargetFilterExpr;
  getLabel: () => Label;
}) {
  const match = (expression: AttrsSchema.FilterExpr) => {
    return Equal.equals(expression, opts.expression)
      ? Result.succeed(undefined)
      : Result.fail(expression);
  };

  return {
    ...entryTag.Named(),
    family: opts.family,
    make: () => opts.expression,
    match,
    select: () => Option.some(opts.expression),
    getLabel: (expression: AttrsSchema.FilterExpr) => {
      return Option.map(Result.getSuccess(match(expression)), opts.getLabel);
    },
    selection: (expression: AttrsSchema.FilterExpr) => Result.getSuccess(match(expression)),
  };
}

export function namedWithPicker<Value extends FilterValue>(opts: {
  family?: symbol;
  make: (value: Value) => AttrsSchema.TargetFilterExpr;
  match: (expression: AttrsSchema.FilterExpr) => Result.Result<Value, AttrsSchema.FilterExpr>;
  getLabel: (value: Value) => Label;
  picker: Picker<Value>;
}) {
  return {
    ...entryTag.Named(),
    family: opts.family,
    picker: opts.picker,
    make: opts.make,
    match: opts.match,
    select: (raw: PickerValue) => Option.map(opts.picker.map(raw), opts.make),
    getLabel: (expression: AttrsSchema.FilterExpr) => {
      return Option.map(Result.getSuccess(opts.match(expression)), opts.getLabel);
    },
    selection: (expression: AttrsSchema.FilterExpr) => {
      return Option.flatMap(Result.getSuccess(opts.match(expression)), opts.picker.unmap);
    },
  };
}

export type Group = { label: DisplayLabel; entries: readonly Definition[] };

export function group(opts: Group): Group {
  return opts;
}

export function create(opts: { groups: readonly Group[]; aliases: readonly Named[] }) {
  const entries = Array.flatMap(opts.groups, (group) => group.entries);

  const cmp = Array.filterMap(
    entries,
    Match.type<Definition>().pipe(
      Match.tag("Comparison", (entry) => entry),
      Match.result,
    ),
  );

  const named = [
    ...opts.aliases,
    ...Array.filterMap(
      entries,
      Match.type<Definition>().pipe(
        Match.tag("Named", (entry) => entry),
        Match.result,
      ),
    ),
  ];

  const labels = [...named, ...cmp];

  const family = (expression: AttrsSchema.FilterExpr) => {
    return Array.findFirst(named, (entry) => {
      return entry.family !== undefined && Option.isSome(entry.selection(expression));
    });
  };

  const matches = (left: AttrsSchema.FilterExpr, right: AttrsSchema.FilterExpr) => {
    if (Predicate.isTagged(left, "cmp") && Predicate.isTagged(right, "cmp")) {
      return Equal.equals(left.val[0], right.val[0]) && left.val[1] === right.val[1];
    }

    const a = family(left);
    const b = family(right);

    return Option.isSome(a) && Option.isSome(b) && a.value.family === b.value.family;
  };

  return {
    groups: opts.groups,
    cmp,
    named,
    getLabel: (expression: AttrsSchema.FilterExpr) => {
      return Array.findFirst(labels, (entry) => entry.getLabel(expression));
    },
    findGroup: (expression: AttrsSchema.FilterExpr) => {
      return Array.findFirst(opts.groups, (group) => {
        return group.entries.some((entry) => Option.isSome(entry.selection(expression)));
      });
    },
    setExpression: (
      siblings: AttrsSchema.Filter,
      next: AttrsSchema.FilterExpr,
      operator: "and" | "or",
    ): AttrsSchema.Filter => {
      if (operator === "or") return Array.append(siblings, next);

      const first = Array.findFirstIndex(siblings, (sibling) => matches(sibling, next));

      return Option.match(first, {
        onNone: () => Array.append(siblings, next),
        onSome: (index) => {
          return Array.flatMap(siblings, (sibling, i) => {
            return i === index ? [next] : matches(sibling, next) ? [] : [sibling];
          });
        },
      });
    },
  };
}

export type Registry = ReturnType<typeof create>;

export function updateGroup(
  filter: AttrsSchema.Filter,
  path: readonly number[],
  update: (children: AttrsSchema.Filter) => AttrsSchema.Filter,
): AttrsSchema.Filter {
  if (!path.length) return update(filter);
  const [index, ...rest] = path;

  return Array.map(filter, (expression, position) => {
    return position === index && !Predicate.isTagged(expression, "cmp")
      ? AttrsSchema.makeFilterExpr[expression._tag]({
          val: updateGroup(expression.val, rest, update),
        })
      : expression;
  });
}

export function removeExpression(
  filter: AttrsSchema.Filter,
  path: readonly number[],
): AttrsSchema.Filter {
  const [index, ...rest] = path;

  return Array.flatMap(filter, (expression, position) => {
    if (position !== index) return [expression];

    if (!rest.length) return [];

    if (Predicate.isTagged(expression, "cmp")) return [expression];
    const children = removeExpression(expression.val, rest);

    return children.length < 2
      ? children
      : [AttrsSchema.makeFilterExpr[expression._tag]({ val: children })];
  });
}

function scalarPicker<Raw extends PickerValue, Encoded>(
  kind: PickerKind,
  schema: Schema.Codec<Raw, Encoded>,
) {
  return <Value>(opts: PickerOptions & Adapt<Raw, Value>): Picker<Value> => {
    const decode = Schema.decodeUnknownOption(schema);

    return {
      ...kind,
      ...opts,
      map: (raw: PickerValue) => Option.map(decode(raw), opts.map),
      unmap: (value: FilterValue) => Option.flatMap(opts.unmap(value), decode),
    };
  };
}

function recordPicker<Value>(
  opts: PickerOptions & { filter: AttrsSchema.TargetFilter } & Adapt<AttrsSchema.RecordId, Value>,
): Picker<Value> {
  const decode = Schema.decodeUnknownOption(AttrsSchema.RecordId);

  return {
    ...pickerKind.Record({ filter: opts.filter }),
    ...opts,
    map: (raw: PickerValue) => Option.map(decode(raw), opts.map),
    unmap: (value: FilterValue) => Option.flatMap(opts.unmap(value), decode),
  };
}

type Choices<Raw> = {
  groups: readonly { label: string; choices: readonly { label: string; value: Raw }[] }[];
};

function choicesPicker<Raw extends PickerValue, Value = Raw>(
  opts: PickerOptions & Choices<Raw> & Adapt<Raw, Value>,
): Picker<Value> {
  const choices = Array.flatMap(opts.groups, (group) => group.choices);

  const find = (raw: PickerValue) => {
    return Array.findFirst(choices, (choice) => Equal.equals(choice.value, raw));
  };

  return {
    ...pickerKind.Choices({ groups: opts.groups }),
    ...opts,
    map: (raw: PickerValue) => Option.map(find(raw), (choice) => opts.map(choice.value)),
    unmap: (value: FilterValue) => {
      return Option.flatMap(opts.unmap(value), (raw) => {
        return Option.map(find(raw), (choice) => choice.value);
      });
    },
  };
}
