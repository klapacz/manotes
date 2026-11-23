import { Array, identity, Match, Option, pipe, Result, Schema } from "effect";
import { AttrsSchema } from "../attrs.schema";
import { BuiltinAttrs } from "../builtin-attrs";
import type { PresetRecordRepo } from "../preset-record.repo";
import type { PropRecordRepo } from "../prop-record.repo";
import { PlainDateString } from "../temporal.schema";
import {
  type Group,
  type Registry,
  Label,
  Picker,
  comparison,
  create,
  family,
  group,
  named,
  namedWithPicker,
} from "./filters.internal";

const expr = AttrsSchema.makeTargetFilterExpr;

const recordType = family("recordType");

// Collapse a preset's filter list into one expression so it can be embedded
// and recognized as a single named chip (empty -> none, single -> as-is, many -> AND).
export function presetExpression(
  filter: AttrsSchema.Filter,
): Option.Option<AttrsSchema.FilterExpr> {
  return Array.matchLeft(filter, {
    onEmpty: () => Option.none(),
    onNonEmpty: (head, tail) => {
      return Option.some(
        Array.match(tail, {
          onEmpty: () => head,
          onNonEmpty: () => AttrsSchema.makeFilterExpr.and({ val: filter }),
        }),
      );
    },
  });
}

export function enumOptionsParent(
  expression: AttrsSchema.FilterExpr,
): Result.Result<AttrsSchema.RecordId, AttrsSchema.FilterExpr> {
  return Match.value(expression).pipe(
    Match.tag("and", ({ val }) => {
      // Keep the original strict StreamSettings recognizer, including canonical order.
      if (val.length !== 3) return Result.fail(expression);

      const comparisons = Array.map(val, (child) => {
        return Match.value(child).pipe(
          Match.tag("cmp", ({ val }) => val),
          Match.orElse(() => undefined),
        );
      });

      return Match.value([comparisons[0], comparisons[1], comparisons[2]] as const).pipe(
        Match.when(
          [
            ["_tag", "=", "owned"],
            ["owned_type", "=", "enum_option"],
            ["owned_parent", "=", Schema.is(AttrsSchema.RecordId)],
          ],
          (matches) => matches[2][2],
        ),
        Match.result,
        Result.mapError(() => expression),
      );
    }),
    Match.orElse(() => Result.fail(expression)),
  );
}

export const enumOptions = namedWithPicker({
  family: recordType,
  make: (id: AttrsSchema.RecordId) => {
    return expr.and({
      val: [
        expr.cmp({ val: ["_tag", "=", "owned"] }),
        expr.cmp({ val: ["owned_type", "=", "enum_option"] }),
        expr.cmp({ val: ["owned_parent", "=", id] }),
      ],
    });
  },
  match: enumOptionsParent,
  getLabel: (id) => Label.Record({ id, val: (name) => `Enum options · ${name}` }),
  picker: Picker.Record({
    label: "Enum options",
    map: identity,
    unmap: Schema.decodeUnknownOption(AttrsSchema.RecordId),
    filter: [
      expr.cmp({ val: ["_tag", "=", "prop"] }),
      expr.cmp({ val: ["prop_type", "=", "enum"] }),
    ],
  }),
});

export const aliases = {
  unarchived: named({
    expression: expr.cmp({
      val: [
        ["prop", BuiltinAttrs.archivedId],
        "=",
        AttrsSchema.PropVal.cases.bool.make({ val: false }),
      ],
    }),
    getLabel: () => Label.Literal({ val: "Unarchived" }),
  }),
};

export const ruleViolation = comparison({
  when: [["rule", Schema.is(AttrsSchema.RecordId)], "violation", true],
  make: (id: AttrsSchema.RecordId) => [["rule", id], "violation", true] as const,
  getValue: ([[, id]]) => id,
  getLabel: ([[, id]]) => {
    return Label.Record({ id, val: (name) => `Rule "${name}" violations` });
  },
  picker: Picker.Record({
    label: "Rule violations",
    filter: [expr.cmp({ val: ["_tag", "=", "rule"] }), aliases.unarchived.make()],
    map: identity,
    unmap: Schema.decodeUnknownOption(AttrsSchema.RecordId),
  }),
});

export function property(definition: PropRecordRepo.Def): Group {
  const label = Label.Record({ id: definition.id, val: identity });

  const pickerOptions = {
    label,
    defaultValue: definition.prop_default?.val,
  };

  const valuePicker: Picker<AttrsSchema.PropVal> = Match.value(definition).pipe(
    Match.when({ prop_type: "bool" }, () => {
      return Picker.Choices({
        ...pickerOptions,
        groups: [
          {
            label: "Values",
            choices: [
              { label: "True", value: true },
              { label: "False", value: false },
            ],
          },
        ],
        map: (val: boolean) => AttrsSchema.PropVal.cases.bool.make({ val }),
        unmap: (value) => {
          return Option.map(
            Schema.decodeUnknownOption(AttrsSchema.PropVal.cases.bool)(value),
            (value) => value.val,
          );
        },
      });
    }),
    Match.when({ prop_type: "text" }, () => {
      return Picker.Text({
        ...pickerOptions,
        map: (val: string) => AttrsSchema.PropVal.cases.text.make({ val }),
        unmap: (value) => {
          return Option.map(
            Schema.decodeUnknownOption(AttrsSchema.PropVal.cases.text)(value),
            (value) => value.val,
          );
        },
      });
    }),
    Match.when({ prop_type: "number" }, () => {
      return Picker.Number({
        ...pickerOptions,
        map: (val: number) => AttrsSchema.PropVal.cases.number.make({ val }),
        unmap: (value) => {
          return Option.map(
            Schema.decodeUnknownOption(AttrsSchema.PropVal.cases.number)(value),
            (value) => value.val,
          );
        },
      });
    }),
    Match.when({ prop_type: "link" }, (def) => {
      return Picker.Record({
        ...pickerOptions,
        filter: def.prop_targets ?? [],
        map: (val: AttrsSchema.RecordId) => AttrsSchema.PropVal.cases.link.make({ val }),
        unmap: (value) => {
          return Option.map(
            Schema.decodeUnknownOption(AttrsSchema.PropVal.cases.link)(value),
            (value) => value.val,
          );
        },
      });
    }),
    Match.when({ prop_type: "enum" }, (def) => {
      return Picker.Record({
        ...pickerOptions,
        filter: [enumOptions.make(def.id)],
        map: (val: AttrsSchema.RecordId) => AttrsSchema.PropVal.cases.enum.make({ val }),
        unmap: (value) => {
          return Option.map(
            Schema.decodeUnknownOption(AttrsSchema.PropVal.cases.enum)(value),
            (value) => value.val,
          );
        },
      });
    }),
    Match.exhaustive,
  );

  const equals = comparison({
    when: [
      ["prop", definition.id],
      "=",
      Schema.is(AttrsSchema.PropVal.cases[definition.prop_type]),
    ],
    make: (value: AttrsSchema.PropVal) => [["prop", definition.id], "=", value] as const,
    getLabel: ([, , value]) => {
      return Label.Parts({
        val: [label, Label.Literal({ val: " is " }), Label.Value({ val: value })],
      });
    },
    picker: valuePicker,
  });

  const exists = comparison({
    when: [["prop", definition.id], "exists", Match.boolean],
    make: (value: boolean) => [["prop", definition.id], "exists", value] as const,
    getLabel: ([, , value]) => {
      return Label.Parts({
        val: [label, Label.Literal({ val: value ? " is set" : " is unset" })],
      });
    },
    picker: Picker.Choices({
      label: "Presence",
      map: identity,
      unmap: Schema.decodeUnknownOption(Schema.Boolean),
      groups: [
        {
          label: "",
          choices: [
            { label: "Is set", value: true, icon: "set" },
            { label: "Is unset", value: false, icon: "unset" },
          ],
        },
      ],
    }),
  });

  return group({ label, entries: [equals, exists], propertyId: definition.id });
}

export const body = comparison({
  when: ["body", "contains", Match.string],
  make: (value: string) => ["body", "contains", value] as const,
  getLabel: ([, , value]) => Label.Literal({ val: `“${value}”` }),
  picker: Picker.Text({
    label: "Body contains",
    map: identity,
    unmap: Schema.decodeUnknownOption(Schema.String),
  }),
});

export const date = comparison({
  when: ["date", "=", Schema.is(PlainDateString)],
  make: (value: typeof PlainDateString.Type) => ["date", "=", value] as const,
  getLabel: ([, , value]) => Label.Literal({ val: value }),
  picker: Picker.Date({
    label: "Date",
    map: identity,
    unmap: Schema.decodeUnknownOption(PlainDateString),
  }),
});

const kind = comparison({
  when: ["_tag", "=", Schema.is(AttrsSchema.RecordTag)],
  make: (value: AttrsSchema.RecordTag) => ["_tag", "=", value] as const,
  picker: Picker.Choices<AttrsSchema.RecordTag>({
    label: "Record kind",
    map: identity,
    unmap: Schema.decodeUnknownOption(AttrsSchema.RecordTag),
    groups: [
      {
        label: "Record kinds",
        choices: [
          { label: "Documents", value: "note" },
          { label: "Properties", value: "prop" },
          { label: "Owned records", value: "owned" },
          { label: "Rules", value: "rule" },
          { label: "Presets", value: "preset" },
        ],
      },
    ],
  }),
});

const title = comparison({
  when: ["title", "exists", Match.boolean],
  make: (value: boolean) => ["title", "exists", value] as const,
  getLabel: ([, , value]) => Label.Literal({ val: value ? "Title is set" : "Title is unset" }),
  picker: Picker.Choices({
    label: "Title",
    map: identity,
    unmap: Schema.decodeUnknownOption(Schema.Boolean),
    groups: [
      {
        label: "Title",
        choices: [
          { label: "Is set", value: true, icon: "set" },
          { label: "Is unset", value: false, icon: "unset" },
        ],
      },
    ],
  }),
});

const links = (["->", "<-"] as const).map((direction) => {
  return comparison({
    when: [["link", direction, Schema.is(AttrsSchema.RecordId)], "exists", true],
    make: (id: AttrsSchema.RecordId) => [["link", direction, id], "exists", true] as const,
    getValue: ([[, , id]]) => id,
    getLabel: ([[, , id]]) => {
      return Label.Record({
        id,
        val: (name) => `${direction === "->" ? "Links to" : "Links from"} ${name}`,
      });
    },
    picker: Picker.Record({
      label: direction === "->" ? "Links to" : "Links from",
      map: identity,
      unmap: Schema.decodeUnknownOption(AttrsSchema.RecordId),
      filter: [],
    }),
  });
});

const ownedType = comparison({
  when: ["owned_type", "=", "enum_option"],
  make: (value: "enum_option") => ["owned_type", "=", value] as const,
  picker: Picker.Choices({
    label: "Owned type",
    map: identity,
    unmap: Schema.decodeUnknownOption(Schema.Literal("enum_option")),
    groups: [
      { label: "Owned type", choices: [{ label: "Enum option", value: "enum_option" as const }] },
    ],
  }),
});

const ownedParent = comparison({
  when: ["owned_parent", "=", Schema.is(AttrsSchema.RecordId)],
  make: (id: AttrsSchema.RecordId) => ["owned_parent", "=", id] as const,
  getLabel: ([, , id]) => Label.Record({ id, val: (name) => `Parent is ${name}` }),
  picker: Picker.Record({
    label: "Parent record",
    filter: [],
    map: identity,
    unmap: Schema.decodeUnknownOption(AttrsSchema.RecordId),
  }),
});

const propType = comparison({
  when: ["prop_type", "=", Schema.is(AttrsSchema.PropValTag)],
  make: (value: AttrsSchema.PropValTag) => ["prop_type", "=", value] as const,
  getLabel: ([, , value]) => Label.Literal({ val: `Property type is ${value}` }),
  picker: Picker.Choices({
    label: "Property type",
    map: identity,
    unmap: Schema.decodeUnknownOption(AttrsSchema.PropValTag),
    groups: [
      {
        label: "Property type",
        choices: AttrsSchema.PropValTag.literals.map((value) => ({ label: value, value })),
      },
    ],
  }),
});

const ruleViolationGroup = group({ label: "Rule violations", entries: [ruleViolation] });

export const groups = [
  group({ label: kind.picker.label, entries: [kind] }),
  group({ label: "Body", entries: [body] }),
  group({ label: "Date", entries: [date] }),
  group({ label: "Title", entries: [title] }),
  ...[ownedType, ownedParent, propType].map((entry) => {
    return group({ label: entry.picker.label, entries: [entry] });
  }),
  ...links.map((entry) => group({ label: entry.picker.label, entries: [entry] })),
];

function savedPreset(preset: PresetRecordRepo.Def) {
  return Option.map(presetExpression(preset.preset_filter), (expression) => {
    return named({
      expression,
      getLabel: () => Label.Record({ id: preset.id, val: identity }),
    });
  });
}

const hiddenAliases = [aliases.unarchived, enumOptions] as const;

export function fromDefinitions(defs: readonly PropRecordRepo.Def[]) {
  return create({
    groups: [...groups, ...defs.map(property)],
    aliases: hiddenAliases,
  });
}

export const builtin = fromDefinitions(BuiltinAttrs.defs);

export function forStreams(registry: Registry, presets: readonly PresetRecordRepo.Def[] = []) {
  const savedGroups = pipe(
    presets,
    Array.filterMap((preset) => Result.fromOption(savedPreset(preset), () => undefined)),
    Array.match({
      onEmpty: () => [],
      onNonEmpty: (entries) => [group({ label: "Saved presets", entries })],
    }),
  );

  return create({
    groups: pipe(
      Array.map(registry.groups, (group) => {
        if (group.propertyId === undefined) return group;

        return {
          ...group,
          entries: Array.append(group.entries, propertyValidity(group.propertyId)),
        };
      }),
      Array.appendAll([...savedGroups, ruleViolationGroup]),
    ),
    aliases: hiddenAliases,
  });
}

function propertyValidity(propId: AttrsSchema.RecordId) {
  return comparison({
    when: [["prop", propId], "violation", Match.boolean],
    make: (violation: boolean) => [["prop", propId], "violation", violation] as const,
    getLabel: ([, , violation]) => {
      return Label.Record({
        id: propId,
        val: (name) => {
          return violation ? `Property "${name}" violations` : `Property "${name}" is valid`;
        },
      });
    },
    picker: Picker.Choices({
      label: "Validity",
      map: identity,
      unmap: Schema.decodeUnknownOption(Schema.Boolean),
      groups: [
        {
          label: "",
          choices: [
            { label: "Is valid", value: false, icon: "valid" },
            { label: "Is invalid", value: true, icon: "invalid" },
          ],
        },
      ],
    }),
  });
}

export * from "./filters.internal";

export * as Filters from "./filters";
