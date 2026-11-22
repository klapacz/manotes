import { describe, expect, expectTypeOf, it } from "vite-plus/test";
import { identity, Match, Option, Predicate, Schema } from "effect";
import { AttrsSchema } from "../attrs.schema";
import { BuiltinAttrs } from "../builtin-attrs";
import { PaneSchema } from "./pane.schema";
import { RecordSearch } from "./search";
import { Filters } from "./filters";

const expr = AttrsSchema.makeFilterExpr;

const registry = Filters.builtin;

const id = AttrsSchema.RecordId.make("priority");

const other = AttrsSchema.RecordId.make("other");

describe("Filters definitions and Outline operations", () => {
  it("offers property violations only in stream registries and labels built-in and custom properties", () => {
    const streams = Filters.forStreams(registry);

    for (const propId of [id, BuiltinAttrs.archivedId]) {
      const expression = Filters.propertyViolation.make(propId);
      expect(expression).toEqual(expr.cmp({ val: [["prop", propId], "violation", true] }));
      expect(Filters.propertyViolation.select(propId)).toEqual(Option.some(expression));
      expect(Filters.propertyViolation.selection(expression)).toEqual(Option.some(propId));
      expect(Option.isSome(streams.findGroup(expression))).toBe(true);
      expect(registry.findGroup(expression)).toEqual(Option.none());
      const label = Option.getOrThrow(streams.getLabel(expression));
      const rendered = Filters.renderLabel(label, () => "Priority");

      if (propId === BuiltinAttrs.archivedId) {
        expect(rendered).toBe('Property "Archived" violations');
      } else expect(rendered).toBe('Property "Priority" violations');
    }

    expect(Filters.propertyViolation.picker._tag).toBe("Property");
    expect(Filters.propertyViolation.picker.label).toBe("Property violations");
    expect(Filters.ruleViolation.picker.label).toBe("Rule violations");
    expect(Filters.propertyViolation.select(false)).toEqual(Option.none());
  });

  it("uses distinct family tokens even when their labels match", () => {
    expect(Filters.family("recordType")).not.toBe(Filters.family("recordType"));
    expectTypeOf<string>().not.toMatchTypeOf<NonNullable<Filters.Named["family"]>>();
  });

  it("labels aliases but finds their original property group without duplicating Archived", () => {
    const unarchived = Filters.aliases.unarchived.make();
    expect(Filters.renderLabel(Option.getOrThrow(registry.getLabel(unarchived)))).toBe(
      "Unarchived",
    );
    const group = Option.getOrThrow(registry.findGroup(unarchived));
    expect(Filters.renderLabel(group.label)).toBe("Archived");
    expect(group.entries).toHaveLength(2);
    expect(
      registry.groups.filter((candidate) => Filters.renderLabel(candidate.label) === "Archived"),
    ).toHaveLength(1);

    const unmatched = Filters.named({
      expression: AttrsSchema.makeTargetFilterExpr.or({ val: [] }),
      getLabel: () => Filters.Label.Literal({ val: "Custom" }),
    });

    const custom = Filters.create({ groups: [], aliases: [unmatched] });
    expect(custom.findGroup(unmatched.make())).toEqual(Option.none());
  });

  it("replaces matching direct siblings once, keeps other operators and descendants", () => {
    const first = Filters.body.make("first");
    const next = Filters.body.make("next");
    const archived = Filters.aliases.unarchived.make();
    const nested = expr.or({ val: [first] });
    const exists = expr.cmp({ val: [["prop", BuiltinAttrs.archivedId], "exists", true] });
    expect(
      registry.setExpression(
        [first, archived, Filters.body.make("duplicate"), nested, exists],
        next,
        "and",
      ),
    ).toEqual([next, archived, nested, exists]);
    expect(registry.setExpression([archived, exists], archived, "and")).toEqual([archived, exists]);
    expect(
      Filters.updateGroup([nested], [0], (siblings) => {
        return registry.setExpression(siblings, next, "or");
      }),
    ).toEqual([expr.or({ val: [first, next] })]);
  });

  it("replaces recognized Type choices in AND and appends alternatives in OR", () => {
    const choices = [
      Filters.namedTypes.notes.make(),
      Filters.namedTypes.pages.make(),
      Filters.namedTypes.properties.make(),
      Filters.enumOptions.make(id),
      Filters.enumOptions.make(other),
      Filters.namedTypes.rules.make(),
      Filters.namedTypes.presets.make(),
    ];

    const archived = Filters.aliases.unarchived.make();

    for (const previous of choices) {
      for (const next of choices) {
        expect(registry.setExpression([previous, archived], next, "and")).toEqual([next, archived]);
        expect(registry.setExpression([previous, archived], next, "or")).toEqual([
          previous,
          archived,
          next,
        ]);
      }
    }

    expect(registry.setExpression(choices, Filters.namedTypes.pages.make(), "and")).toEqual([
      Filters.namedTypes.pages.make(),
    ]);
  });

  it("appends comparison alternatives in OR and preserves custom groups in AND", () => {
    const first = Filters.body.make("first");
    const next = Filters.body.make("next");
    expect(registry.setExpression([first], next, "or")).toEqual([first, next]);

    const custom = expr.and({ val: [Filters.namedTypes.pages.make(), first] });
    const options = Filters.enumOptions.make(id);
    expect(registry.setExpression([custom], options, "and")).toEqual([custom, options]);
    expect(registry.setExpression([custom], options, "or")).toEqual([custom, options]);
  });

  it("keeps the Type picker separate from raw record tag controls", () => {
    const group = Option.getOrThrow(registry.findGroup(Filters.namedTypes.pages.make()));
    expect(group.entries).toHaveLength(6);
    expect(group.entries.every((entry) => Predicate.isTagged(entry, "Named"))).toBe(true);
    expect(registry.findGroup(Filters.namedTypes.properties.make())).toEqual(Option.some(group));
    expect(registry.findGroup(Filters.enumOptions.make(id))).toEqual(Option.some(group));
    const raw = expr.cmp({ val: ["_tag", "=", "owned"] });
    expect(Filters.renderLabel(Option.getOrThrow(registry.findGroup(raw)).label)).toBe(
      "Record kind",
    );
  });

  it("uses picker choice labels for comparisons by default", () => {
    const expressions = [
      ...AttrsSchema.RecordTag.literals.map((tag) => expr.cmp({ val: ["_tag", "=", tag] })),
      expr.cmp({ val: ["owned_type", "=", "enum_option"] }),
    ];

    for (const expression of expressions) {
      const entry = registry.cmp.find((entry) => Option.isSome(entry.selection(expression)))!;
      const picker = entry.picker;

      if (!picker || !Predicate.isTagged(picker, "Choices")) {
        throw new Error("Expected a choice picker");
      }

      const raw = Option.getOrThrow(entry.selection(expression));

      const choice = picker.groups
        .flatMap((group) => group.choices)
        .find((item) => item.value === raw)!;

      const label = Option.getOrThrow(picker.getLabel(raw));
      expect(Filters.renderLabel(label)).toBe(choice.label);
      expect(entry.getLabel(expression)).toEqual(Option.some(label));
      expect(registry.getLabel(expression)).toEqual(Option.some(label));
      expect(entry.select(raw)).toEqual(Option.some(expression));
    }
  });

  it("unmaps choice values for default labels and rejects unrecognized expressions", () => {
    const entry = Filters.comparison({
      when: [["prop", id], "=", Schema.is(AttrsSchema.PropVal.cases.bool)],
      make: (value: AttrsSchema.PropVal) => [["prop", id], "=", value] as const,
      picker: Filters.Picker.Choices({
        label: "Status",
        groups: [{ label: "Values", choices: [{ label: "Off", value: false }] }],
        map: (val: boolean) => AttrsSchema.PropVal.cases.bool.make({ val }),
        unmap: (value) => {
          return Option.map(
            Schema.decodeUnknownOption(AttrsSchema.PropVal.cases.bool)(value),
            (value) => value.val,
          );
        },
      }),
    });

    const value = AttrsSchema.PropVal.cases.bool.make({ val: false });
    const expression = entry.make(value);
    expect(entry.getLabel(expression)).toEqual(Option.some(Filters.Label.Literal({ val: "Off" })));
    expect(entry.selection(expression)).toEqual(Option.some(false));
    expect(entry.select(false)).toEqual(Option.some(expression));

    for (const unknown of [
      entry.make(AttrsSchema.PropVal.cases.bool.make({ val: true })),
      expr.cmp({ val: [["prop", id], "=", AttrsSchema.PropVal.cases.text.make({ val: "false" })] }),
      expr.cmp({ val: [["prop", other], "=", value] }),
      expr.cmp({ val: [["prop", id], "exists", false] }),
      expr.and({ val: [expression] }),
    ]) {
      expect(entry.getLabel(unknown)).toEqual(Option.none());
      expect(entry.selection(unknown)).toEqual(Option.none());
    }
  });

  it("keeps explicit contextual labels and alias precedence over choice labels", () => {
    const expression = Filters.aliases.unarchived.make();
    const entry = Filters.property(BuiltinAttrs.archived).entries[0]!;
    expect(Filters.renderLabel(Option.getOrThrow(entry.getLabel(expression)))).toBe(
      "Archived is False",
    );
    expect(Filters.renderLabel(Option.getOrThrow(registry.getLabel(expression)))).toBe(
      "Unarchived",
    );
  });

  it("keeps set and unset as presence comparisons for every property kind and Title", () => {
    const definitions = [
      BuiltinAttrs.archived,
      { id, title: "Text", prop_type: "text" as const, prop_default: null },
      { id, title: "Number", prop_type: "number" as const, prop_default: null },
      { id, title: "Link", prop_type: "link" as const, prop_default: null, prop_targets: [] },
      { id, title: "Enum", prop_type: "enum" as const, prop_default: null },
    ];

    for (const definition of definitions) {
      const entry = Filters.property(definition).entries[1]!;

      for (const value of [true, false]) {
        const expression = expr.cmp({ val: [["prop", definition.id], "exists", value] });
        expect(entry.select(value)).toEqual(Option.some(expression));
        expect(entry.selection(expression)).toEqual(Option.some(value));
        expect(
          Filters.renderLabel(Option.getOrThrow(entry.getLabel(expression)), () => "Field"),
        ).toBe(
          `${definition.id === BuiltinAttrs.archivedId ? "Archived" : "Field"} is ${value ? "set" : "unset"}`,
        );
      }
    }

    for (const value of [true, false]) {
      const expression = expr.cmp({ val: ["title", "exists", value] });
      expect(Filters.renderLabel(Option.getOrThrow(registry.getLabel(expression)))).toBe(
        `Title is ${value ? "set" : "unset"}`,
      );
    }
  });

  it("removes only the selected expression, drops empty groups and unwraps single children", () => {
    const notes = Filters.namedTypes.notes.make();
    const archived = Filters.aliases.unarchived.make();
    expect(Filters.removeExpression([notes, archived], [0])).toEqual([archived]);
    expect(
      Filters.removeExpression(
        [expr.or({ val: [notes, expr.and({ val: [archived] })] })],
        [0, 1, 0],
      ),
    ).toEqual([notes]);
  });

  it("keeps fixed and parameterized named builders distinct with the same definition kind", () => {
    expectTypeOf(Filters.namedTypes.notes.make).parameters.toEqualTypeOf<[]>();
    expectTypeOf(Filters.enumOptions.make).parameters.toEqualTypeOf<[AttrsSchema.RecordId]>();
    expect(Filters.namedTypes.notes._tag).toBe(Filters.enumOptions._tag);
    expect(Filters.namedTypes.notes.selection(Filters.namedTypes.notes.make())).toEqual(
      Option.some(undefined),
    );
    expect(Filters.enumOptions.selection(Filters.enumOptions.make(id))).toEqual(Option.some(id));
    expect(
      Filters.renderLabel(
        Option.getOrThrow(Filters.enumOptions.getLabel(Filters.enumOptions.make(id))),
        () => "Priority",
      ),
    ).toBe("Enum options · Priority");
  });

  it("maps values into canonical comparisons and restores picker selections", () => {
    const bool = Filters.property(BuiltinAttrs.archived).entries[0]!;
    const selection = bool.select(false);
    expect(selection).toEqual(Option.some(Filters.aliases.unarchived.make()));
    expect(Option.flatMap(selection, bool.selection)).toEqual(Option.some(false));

    const enumGroup = Filters.property({
      id,
      title: "Priority",
      prop_type: "enum",
      prop_default: null,
    });

    const entry = enumGroup.entries[0]!;
    const value = entry.select(other);
    expect(Option.flatMap(value, entry.selection)).toEqual(Option.some(other));
    expect(entry.picker).toMatchObject({ filter: [Filters.enumOptions.make(id)] });
    expect(Filters.enumOptions.selection(Filters.enumOptions.make(id))).toEqual(Option.some(id));

    const changed = Filters.fromDefinitions([
      { id, title: "Priority", prop_type: "number", prop_default: null },
    ]);

    expect(Option.flatMap(value, changed.findGroup)).toEqual(Option.none());

    const unknown = expr.cmp({
      val: [["prop", id], "=", AttrsSchema.PropVal.cases.text.make({ val: "retain" })],
    });

    expect(Filters.updateGroup([unknown], [], identity)).toEqual([unknown]);
  });

  it("checks explicit mappings and restores all property picker values", () => {
    const text = Filters.Picker.Text({
      label: "Text",
      map: identity,
      unmap: Schema.decodeUnknownOption(Schema.String),
    });

    const number = Filters.Picker.Number({
      label: "Number",
      map: identity,
      unmap: Schema.decodeUnknownOption(Schema.Finite),
    });

    expectTypeOf(text.map).returns.toEqualTypeOf<Option.Option<string>>();
    expectTypeOf(number.map).returns.toEqualTypeOf<Option.Option<number>>();
    expect(text.map("alpha")).toEqual(Option.some("alpha"));
    expect(text.unmap("alpha")).toEqual(Option.some("alpha"));
    expect(number.map("42")).toEqual(Option.none());

    for (const def of [
      {
        id,
        title: "Text",
        prop_type: "text" as const,
        prop_default: AttrsSchema.PropVal.cases.text.make({ val: "default" }),
      },
      {
        id,
        title: "Number",
        prop_type: "number" as const,
        prop_default: AttrsSchema.PropVal.cases.number.make({ val: 42 }),
      },
      {
        id,
        title: "Link",
        prop_type: "link" as const,
        prop_default: AttrsSchema.PropVal.cases.link.make({ val: other }),
        prop_targets: [Filters.namedTypes.pages.make()],
      },
    ]) {
      const entry = Filters.property(def).entries[0]!;
      expect(entry.picker?.defaultValue).toBe(def.prop_default.val);
      expect(Option.flatMap(entry.select(def.prop_default.val), entry.selection)).toEqual(
        Option.some(def.prop_default.val),
      );
    }

    const outgoing = AttrsSchema.makeTargetFilterExpr.cmp({
      val: [["link", "->", id], "exists", true],
    });

    const group = Option.getOrThrow(registry.findGroup(outgoing));
    expect(group.entries[0]!.selection(outgoing)).toEqual(Option.some(id));
  });

  it("rejects invalid scalar values without coercion or throwing", () => {
    const number = Filters.Picker.Number({
      label: "Number",
      map: (val) => AttrsSchema.PropVal.cases.number.make({ val }),
      unmap: (value) => {
        return Option.map(
          Schema.decodeUnknownOption(AttrsSchema.PropVal.cases.number)(value),
          (value) => value.val,
        );
      },
    });

    for (const value of ["42", "", true, undefined, NaN, Infinity, -Infinity]) {
      expect(number.map(value)).toEqual(Option.none());
    }

    for (const value of ["42", "", true]) {
      expect(number.unmap(value)).toEqual(Option.none());
    }

    const zero = AttrsSchema.PropVal.cases.number.make({ val: 0 });
    expect(number.map(0)).toEqual(Option.some(zero));
    expect(number.unmap(zero)).toEqual(Option.some(0));
    expect(Filters.date.select("not a date")).toEqual(Option.none());
    expect(Filters.enumOptions.select(42)).toEqual(Option.none());
  });

  it("requires a configured choice in both mapping directions", () => {
    const choices = Filters.Picker.Choices<boolean>({
      label: "False only",
      map: identity,
      unmap: Schema.decodeUnknownOption(Schema.Boolean),
      groups: [{ label: "Values", choices: [{ label: "False", value: false }] }],
    });

    expect(choices.map(false)).toEqual(Option.some(false));
    expect(choices.unmap(false)).toEqual(Option.some(false));

    for (const value of [true, "false", 0, undefined]) {
      expect(choices.map(value)).toEqual(Option.none());
    }

    for (const value of [true, "false", AttrsSchema.PropVal.cases.bool.make({ val: false })]) {
      expect(choices.unmap(value)).toEqual(Option.none());
    }
  });

  it("propagates failed prefill without erasing the stored expression", () => {
    const restricted = Filters.comparison({
      when: ["body", "contains", Match.string],
      make: (value: string) => ["body", "contains", value] as const,
      getLabel: ([, , value]) => Filters.Label.Literal({ val: value }),
      picker: Filters.Picker.Text({
        label: "Non-empty text",
        map: identity,
        unmap: Schema.decodeUnknownOption(Schema.NonEmptyString),
      }),
    });

    const expression = restricted.make("");

    const custom = Filters.create({
      groups: [Filters.group({ label: "Text", entries: [restricted] })],
      aliases: [],
    });

    expect(restricted.selection(expression)).toEqual(Option.none());
    expect(custom.findGroup(expression)).toEqual(Option.none());
    expect(Filters.updateGroup([expression], [], identity)).toEqual([expression]);
    expect(Filters.removeExpression([expression], [0])).toEqual([]);
  });

  it("collects both record dependencies and renders builtins without record lookup", () => {
    const label = Filters.Label.Parts({
      val: [
        Filters.Label.Record({ id, val: identity }),
        Filters.Label.Literal({ val: " is " }),
        Filters.Label.Value({ val: AttrsSchema.PropVal.cases.enum.make({ val: other }) }),
      ],
    });

    expect(Filters.labelRecords(label)).toEqual([id, other]);
    expect(Filters.renderLabel(label, (record) => (record === id ? "Priority" : "High"))).toBe(
      "Priority is High",
    );
    expect(
      Filters.renderLabel(
        Filters.Label.Record({ id: BuiltinAttrs.archivedId, val: identity }),
        () => "wrong",
      ),
    ).toBe("Archived");
  });

  it("round-trips registry output through canonical URL and target codecs", () => {
    const filter = [
      Filters.namedTypes.pages.make(),
      Filters.enumOptions.make(id),
      Filters.aliases.unarchived.make(),
    ];

    expect(Schema.decodeOption(AttrsSchema.TargetFilter)(filter)).toEqual(Option.some(filter));
    const codec = Schema.fromJsonString(RecordSearch.Schema);

    const settings = Schema.decodeOption(RecordSearch.Schema)({
      panes: [PaneSchema.make.stream({ filter })],
    });

    expect(Option.isSome(settings)).toBe(true);
    const encoded = Option.flatMap(settings, Schema.encodeOption(codec));
    expect(Option.flatMap(encoded, Schema.decodeOption(codec))).toEqual(settings);
    expect(JSON.stringify(settings)).not.toContain("family");
  });

  it("registers saved presets only in stream registries with live record labels", () => {
    const singleExpr = Filters.namedTypes.pages.make();
    const multiFilter = [Filters.namedTypes.notes.make(), Filters.aliases.unarchived.make()];

    expect(Filters.presetExpression([])).toEqual(Option.none());
    expect(Filters.presetExpression([singleExpr])).toEqual(Option.some(singleExpr));
    expect(Filters.presetExpression(multiFilter)).toEqual(
      Option.some(expr.and({ val: multiFilter })),
    );

    const withPresets = Filters.forStreams(registry, [
      { id, title: "Inbox", preset_filter: multiFilter },
      { id: other, title: "Empty", preset_filter: [] },
    ]);

    const presetExpr = Option.getOrThrow(Filters.presetExpression(multiFilter));
    expect(registry.findGroup(presetExpr)).toEqual(Option.none());

    const group = Option.getOrThrow(withPresets.findGroup(presetExpr));
    expect(Filters.renderLabel(group.label)).toBe("Saved presets");
    expect(group.entries).toHaveLength(1);

    const label = Option.getOrThrow(withPresets.getLabel(presetExpr));
    expect(Filters.labelRecords(label)).toEqual([id]);
    expect(Filters.renderLabel(label, () => "Inbox")).toBe("Inbox");
  });
});
