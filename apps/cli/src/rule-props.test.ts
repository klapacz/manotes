import { NodeServices } from "@effect/platform-node";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { BuiltinAttrs } from "@manotes/shared/builtin-attrs";
import { DB } from "@manotes/shared/db.service";
import { EventRepo } from "@manotes/shared/event.repo";
import { CliList } from "@manotes/shared/list";
import { Materializer } from "@manotes/shared/materializer.service";
import { RecordRepo } from "@manotes/shared/record.repo";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { PropDef } from "@manotes/shared/prop-def.service";
import { getProsemirrorXmlFragment } from "@manotes/shared/prosemirror/yjs";
import { RuleProps } from "@manotes/shared/rule-props";
import { RuleRecord } from "@manotes/shared/rule-record.service";
import {
  Array as EffectArray,
  DateTime,
  Effect,
  Equal,
  Layer,
  Option,
  Predicate,
  Record,
  Stream,
  SubscriptionRef,
  type Scope,
} from "effect";
import { Reactivity } from "effect/reactivity";
import { SqlClient } from "effect/sql";
import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import { CliRuntime } from "./cli.runtime";

const priority = AttrsSchema.RecordId.make("prop_id:priority");

const cycle = AttrsSchema.RecordId.make("prop_id:cycle");

const task = AttrsSchema.RecordId.make("rule_id:task");

const recordId = AttrsSchema.RecordId.make("record_id:issue");

const required = AttrsSchema.RuleExpectation.cases.required.make({});

describe("reactive rule props pipeline", () => {
  it("loads rule expectations and the limited list with matches in two queries", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const attrs = yield* Attrs.Service;
        const records = yield* RecordRepo.Service;
        const ruleRecords = yield* RuleRecord.Service;
        const sql = yield* SqlClient.SqlClient;
        const otherId = AttrsSchema.RecordId.make("record_id:other");
        const otherRuleId = AttrsSchema.RecordId.make("rule_id:other");

        yield* save(yield* makeDoc(), recordId);
        yield* save(yield* makeDoc(), otherId);

        const rule = yield* makeDoc();
        yield* attrs.initializeRule({
          doc: rule,
          targets: [AttrsSchema.makeTargetFilterExpr.cmp({ val: ["id", "=", recordId] })],
        });
        yield* attrs.setRuleExpectation({ doc: rule, propId: priority, value: required });
        yield* save(rule, task);

        const other = yield* makeDoc();
        yield* attrs.initializeRule({
          doc: other,
          targets: [AttrsSchema.makeTargetFilterExpr.cmp({ val: ["id", "=", otherId] })],
        });
        yield* save(other, otherRuleId);

        const query = vi.spyOn(sql, "unsafe");
        const rules = yield* ruleRecords.list();

        const rows = yield* records.list({ filter: recordsFilter(), limit: 1 }, { rules });

        const reads = query.mock.calls.filter(([statement]) => statement.includes('"records"'));
        query.mockRestore();

        expect(reads).toHaveLength(2);
        expect(rules.find((rule) => rule.id === task)?.expects[priority]).toEqual(required);
        expect(rows.map(({ id, rulesMatched }) => ({ id, rulesMatched }))).toEqual([
          { id: recordId, rulesMatched: [{ id: task }] },
        ]);

        const manyRules = Array.from({ length: 1001 }, (_, index) => ({
          id: AttrsSchema.RecordId.make(`unused-rule:${index}`),
          title: null,
          rule_storage: AttrsSchema.RuleStorage.cases.top.make({}),
          rule_targets: [],
          expects: {},
        }));

        const large = yield* records.list(
          { filter: recordsFilter(), limit: 1 },
          { rules: [...manyRules, ...rules] },
        );

        expect(large[0]?.rulesMatched).toEqual([{ id: task }]);
      }),
    );
  });

  it("lists records missing required assignments within a rule's scope before applying the limit", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const attrs = yield* Attrs.Service;
        const outside = AttrsSchema.RecordId.make("record_id:aaa-outside");
        const complete = AttrsSchema.RecordId.make("record_id:complete");
        const value = AttrsSchema.PropVal.cases.number.make({ val: 1 });
        const definition = yield* makeDoc();
        yield* attrs.initializeProp({ doc: definition, defaultValue: value });
        yield* save(definition, priority);

        const rule = yield* makeDoc();
        const target = AttrsSchema.makeTargetFilterExpr;
        yield* attrs.initializeRule({
          doc: rule,
          targets: [
            target.or({
              val: [
                target.cmp({ val: ["id", "=", complete] }),
                target.cmp({ val: ["id", "=", recordId] }),
              ],
            }),
          ],
        });
        yield* attrs.setRuleStorage({
          doc: rule,
          storage: AttrsSchema.RuleStorage.cases.group.make({}),
        });
        yield* attrs.setRuleExpectation({ doc: rule, propId: priority, value: required });
        yield* attrs.setRuleExpectation({
          doc: rule,
          propId: cycle,
          value: AttrsSchema.RuleExpectation.cases.optional.make({}),
        });
        yield* save(rule, task);
        yield* save(yield* makeNote(), outside);

        const completeDoc = yield* makeNote();
        yield* attrs.setGroupProp({
          doc: completeDoc,
          recordId: complete,
          ruleId: task,
          propId: priority,
          value,
        });
        yield* save(completeDoc, complete);

        const doc = yield* makeNote();
        yield* save(doc, recordId);

        const expr = AttrsSchema.makeFilterExpr;

        const listInvalid = (ruleId: AttrsSchema.RecordId) => {
          return CliList.list({
            filter: [
              expr.and({
                val: [expr.or({ val: [expr.cmp({ val: [["rule", ruleId], "violation", true] })] })],
              }),
            ],
            limit: 1,
          }).pipe(Effect.map((rows) => rows.map((row) => row.id)));
        };

        // The default does not supply an assignment at the rule's path.
        expect(yield* listInvalid(task)).toEqual([recordId]);
        yield* attrs.setProp({ doc, recordId, propId: priority, value });
        yield* save(doc, recordId);
        expect(yield* listInvalid(task)).toEqual([recordId]);

        yield* attrs.setRuleStorage({
          doc: rule,
          storage: AttrsSchema.RuleStorage.cases.top.make({}),
        });
        yield* save(rule, task);
        expect(yield* listInvalid(task)).toEqual([complete]);
        expect(yield* listInvalid(outside)).toEqual([]);
      }),
    );
  });

  it("lists violations of any unarchived rule and matches nothing without rules", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const attrs = yield* Attrs.Service;
        const otherRecord = AttrsSchema.RecordId.make("record_id:other");
        const otherRule = AttrsSchema.RecordId.make("rule_id:other");
        const filter = [AttrsSchema.makeFilterExpr.cmp({ val: ["rules", "violation", true] })];

        const listViolations = () => {
          return CliList.list({ filter }).pipe(Effect.map((rows) => rows.map((row) => row.id)));
        };

        expect(yield* listViolations()).toEqual([]);

        const rules = yield* Effect.forEach(
          [
            [task, recordId],
            [otherRule, otherRecord],
          ] as const,
          ([ruleId, targetId]) => {
            return Effect.gen(function* () {
              yield* save(yield* makeNote(), targetId);
              const doc = yield* makeDoc();
              yield* attrs.initializeRule({
                doc,
                targets: [AttrsSchema.makeTargetFilterExpr.cmp({ val: ["id", "=", targetId] })],
              });
              yield* attrs.setRuleExpectation({ doc, propId: priority, value: required });
              yield* save(doc, ruleId);

              return { doc, ruleId, targetId };
            });
          },
        );

        expect(new Set(yield* listViolations())).toEqual(new Set([recordId, otherRecord]));

        for (const { doc, ruleId, targetId } of rules) {
          yield* attrs.setProp({
            doc,
            recordId: ruleId,
            propId: BuiltinAttrs.archivedId,
            value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
          });
          yield* save(doc, ruleId);
          expect(yield* listViolations()).not.toContain(targetId);
        }

        expect(yield* listViolations()).toEqual([]);
      }),
    );
  });

  it("filters invalid saved property values across paths before applying the limit", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const attrs = yield* Attrs.Service;
        const records = yield* RecordRepo.Service;
        const definition = yield* makeDoc();
        yield* attrs.initializeProp({
          doc: definition,
          defaultValue: AttrsSchema.PropVal.cases.number.make({ val: 0 }),
        });
        yield* save(definition, priority);

        const valid = AttrsSchema.RecordId.make("record_id:aaa-valid");
        const missing = AttrsSchema.RecordId.make("record_id:bbb-unset");
        const grouped = AttrsSchema.RecordId.make("record_id:zzz-grouped");
        const unavailable = AttrsSchema.RecordId.make("prop_id:unavailable");
        const zero = AttrsSchema.PropVal.cases.number.make({ val: 0 });
        const wrong = AttrsSchema.PropVal.cases.text.make({ val: "old type" });
        const validDoc = yield* makeNote();
        yield* attrs.setProp({ doc: validDoc, recordId: valid, propId: priority, value: zero });
        yield* save(validDoc, valid);
        yield* save(yield* makeNote(), missing);
        const doc = yield* makeNote();
        yield* attrs.setProp({ doc, recordId, propId: priority, value: wrong });
        yield* attrs.setProp({ doc, recordId, propId: unavailable, value: zero });
        yield* attrs.setProp({
          doc,
          recordId,
          propId: BuiltinAttrs.archivedId,
          value: wrong,
        });
        yield* save(doc, recordId);
        const group = yield* makeNote();
        yield* attrs.setProp({ doc: group, recordId: grouped, propId: priority, value: zero });
        yield* attrs.setGroupProp({
          doc: group,
          recordId: grouped,
          ruleId: task,
          propId: priority,
          value: wrong,
        });
        yield* save(group, grouped);

        const expr = AttrsSchema.makeFilterExpr;

        const invalid = (propId: AttrsSchema.RecordId) => {
          return expr.cmp({ val: [["prop", propId], "violation", true] });
        };

        const filter = [
          expr.and({
            val: [expr.or({ val: [invalid(priority), invalid(BuiltinAttrs.archivedId)] })],
          }),
        ];

        const rows = yield* CliList.list({ filter });
        expect(rows.map((row) => row.id)).toEqual([recordId, grouped]);
        expect((yield* CliList.list({ filter, limit: 1 })).map((row) => row.id)).toEqual([
          recordId,
        ]);
        expect(yield* CliList.list({ filter: [invalid(unavailable)] })).toEqual([]);
        expect(
          (yield* CliList.list({
            filter: [expr.cmp({ val: [["prop", unavailable], "exists", true] })],
          })).map((row) => row.id),
        ).toEqual([recordId]);
        expect(yield* records.list({ filter: [invalid(priority)] })).toEqual([]);

        const allProps = [expr.cmp({ val: ["props", "violation", true] })];
        expect((yield* CliList.list({ filter: allProps })).map((row) => row.id)).toEqual([
          recordId,
          grouped,
        ]);
        expect((yield* CliList.list({ filter: allProps, limit: 1 })).map((row) => row.id)).toEqual([
          recordId,
        ]);
        expect(yield* records.list({ filter: allProps })).toEqual([]);

        yield* attrs.setProp({
          doc: definition,
          recordId: priority,
          propId: BuiltinAttrs.archivedId,
          value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
        });
        yield* save(definition, priority);

        // The archived custom property stops matching; the invalid built-in value still matches.
        expect((yield* CliList.list({ filter: allProps })).map((row) => row.id)).toEqual([
          recordId,
        ]);
      }),
    );
  });

  it("requires scoped link targets and existing unarchived options of the selected enum", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const attrs = yield* Attrs.Service;
        const assignee = AttrsSchema.RecordId.make("prop_id:assignee");
        const status = AttrsSchema.RecordId.make("prop_id:status");
        const target = AttrsSchema.RecordId.make("record_id:person");
        const active = AttrsSchema.RecordId.make("option_id:active");
        const archived = AttrsSchema.RecordId.make("option_id:archived");
        const foreign = AttrsSchema.RecordId.make("option_id:foreign");
        const absent = AttrsSchema.RecordId.make("record_id:absent");
        const link = yield* makeDoc();
        yield* attrs.initializeProp({ doc: link });
        yield* attrs.setPropType({ doc: link, type: "link" });
        yield* attrs.setPropTargets({
          doc: link,
          targets: [AttrsSchema.makeTargetFilterExpr.cmp({ val: ["id", "=", target] })],
        });
        yield* save(link, assignee);
        const enumeration = yield* makeDoc();
        yield* attrs.initializeProp({ doc: enumeration });
        yield* attrs.setPropType({ doc: enumeration, type: "enum" });
        yield* save(enumeration, status);
        yield* save(yield* makeNote(), target);

        for (const { id, parent } of [
          { id: active, parent: status },
          { id: archived, parent: status },
          { id: foreign, parent: priority },
        ]) {
          const doc = yield* makeDoc();
          yield* attrs.initializeEnumOption({ doc, enum_parent: parent });

          if (id === archived) {
            yield* attrs.setProp({
              doc,
              recordId: id,
              propId: BuiltinAttrs.archivedId,
              value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
            });
          }

          yield* save(doc, id);
        }

        const assignments = [
          { name: "active", link: target, option: active },
          { name: "archived", link: active, option: archived },
          { name: "foreign", link: absent, option: foreign },
          { name: "missing", link: target, option: absent },
          { name: "wrong-kind", link: target, option: target },
        ];

        for (const input of assignments) {
          const id = AttrsSchema.RecordId.make(input.name);
          const doc = yield* makeNote();
          yield* attrs.setProp({
            doc,
            recordId: id,
            propId: assignee,
            value: AttrsSchema.PropVal.cases.link.make({ val: input.link }),
          });
          yield* attrs.setProp({
            doc,
            recordId: id,
            propId: status,
            value: AttrsSchema.PropVal.cases.enum.make({ val: input.option }),
          });
          yield* save(doc, id);
        }

        const listInvalid = (propId: AttrsSchema.RecordId) => {
          return CliList.list({
            filter: [
              AttrsSchema.makeFilterExpr.cmp({ val: [["prop", propId], "violation", true] }),
            ],
          }).pipe(Effect.map((rows) => rows.map((row) => row.id)));
        };

        expect(yield* listInvalid(assignee)).toEqual(["archived", "foreign"]);
        expect(yield* listInvalid(status)).toEqual([
          "archived",
          "foreign",
          "missing",
          "wrong-kind",
        ]);
        yield* attrs.setPropTargets({ doc: link, targets: undefined });
        yield* save(link, assignee);
        expect(yield* listInvalid(assignee)).toEqual(["foreign"]);
      }),
    );
  });

  it("excludes archived rules from CLI and live stream invalid filters until restored", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const attrs = yield* Attrs.Service;
        const records = yield* RecordRepo.Service;
        const ruleRecords = yield* RuleRecord.Service;
        const rule = yield* makeDoc();
        yield* attrs.initializeRule({
          doc: rule,
          targets: [AttrsSchema.makeTargetFilterExpr.cmp({ val: ["id", "=", recordId] })],
        });
        yield* attrs.setRuleExpectation({ doc: rule, propId: priority, value: required });
        yield* save(rule, task);
        yield* save(yield* makeNote(), recordId);

        const query: RecordRepo.StreamListQuery = {
          filter: [AttrsSchema.makeFilterExpr.cmp({ val: [["rule", task], "violation", true] })],
          sort: "updated",
        };

        const latest = yield* SubscriptionRef.make<readonly AttrsSchema.RecordId[] | undefined>(
          undefined,
        );

        const rules = yield* ruleRecords.reactiveList();
        yield* rules.pipe(
          Stream.changes,
          Stream.switchMap((rules) => Stream.unwrap(records.reactiveStreamList(query, { rules }))),
          Stream.map(EffectArray.map((row) => row.id)),
          Stream.runForEach((ids) => SubscriptionRef.set(latest, ids)),
          Effect.forkChild,
        );

        const expectIds = (ids: readonly AttrsSchema.RecordId[]) => {
          return Effect.gen(function* () {
            yield* SubscriptionRef.changes(latest).pipe(
              Stream.filter(Equal.equals(ids)),
              Stream.runHead,
              Effect.flatMap(Effect.fromOption),
              Effect.timeout("5 seconds"),
            );
            const rows = yield* CliList.list(query);
            expect(EffectArray.map(rows, (row) => row.id)).toEqual(ids);
          });
        };

        yield* expectIds([recordId]);
        yield* attrs.setProp({
          doc: rule,
          recordId: task,
          propId: BuiltinAttrs.archivedId,
          value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
        });
        yield* save(rule, task);
        yield* expectIds([]);

        yield* attrs.clearProp({ doc: rule, propId: BuiltinAttrs.archivedId });
        yield* save(rule, task);
        yield* expectIds([recordId]);
      }),
    );
  });

  it("follows saved Yjs values, target edits, expectations and rule availability without writing attrs", async () => {
    const root = new Y.Doc();
    const observe = vi.spyOn(root.getMap("attrs"), "observeDeep");
    const unobserve = vi.spyOn(root.getMap("attrs"), "unobserveDeep");

    await runIntegration(
      Effect.gen(function* () {
        const doc = yield* Effect.acquireRelease(Effect.succeed(root), (doc) => {
          return Effect.sync(() => doc.destroy());
        });

        const attrs = yield* Attrs.Service;
        const definition = yield* makeDoc();
        yield* attrs.initializeProp({
          doc: definition,
          defaultValue: AttrsSchema.PropVal.cases.number.make({ val: 0 }),
        });
        yield* save(definition, priority);

        const rule = yield* makeDoc();
        yield* attrs.initializeRule({ doc: rule, targets: recordsFilter() });
        yield* attrs.setRuleStorage({
          doc: rule,
          storage: AttrsSchema.RuleStorage.cases.group.make({}),
        });
        yield* attrs.setRuleExpectation({ doc: rule, propId: priority, value: required });
        yield* save(rule, task);

        const props = new Y.Map<unknown>();
        doc.getMap("attrs").set("props", props);
        const group = new Y.Map<unknown>();
        group.set("_tag", "group");
        const values = new Y.Map<unknown>();
        group.set("props", values);
        values.set(priority, AttrsSchema.PropVal.cases.number.make({ val: 1 }));
        props.set(task, group);
        props.set("prop_id:custom", AttrsSchema.PropVal.cases.bool.make({ val: true }));
        yield* save(doc, recordId);

        const before = Y.encodeStateAsUpdate(doc);
        const latest = yield* startWatching(doc);

        const initial = yield* waitFor(latest, (groups) => {
          return (
            hasGroupStatus(groups, task, "Matching") &&
            hasPropValueState(groups, task, priority, "Valid")
          );
        });

        expect(Record.keys(initial.groups)).toEqual([task]);
        expect(initial.top.props[AttrsSchema.RecordId.make("prop_id:custom")]).toMatchObject({
          expectation: Option.none(),
          value: Attrs.ValueState.Invalid({
            value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
          }),
        });
        expect(Y.encodeStateAsUpdate(doc)).toEqual(before);

        // A supported value of the wrong type remains visible as Invalid.
        const wrongType = AttrsSchema.PropVal.cases.bool.make({ val: true });
        values.set(priority, wrongType);
        yield* waitFor(latest, (groups) => hasPropValueState(groups, task, priority, "Invalid"));
        expect(values.get(priority)).toEqual(wrongType);

        values.set(priority, AttrsSchema.PropVal.cases.number.make({ val: 2 }));
        yield* waitFor(latest, (groups) => hasPropValueState(groups, task, priority, "Valid"));

        // Target changes stop expectations but retain the saved group's values.
        yield* attrs.setRuleTargets({
          doc: rule,
          targets: StreamSettings.presets.pages.filter,
        });
        yield* save(rule, task);
        yield* waitFor(latest, (groups) => {
          const prop = groups.groups[task]?.props[priority];

          if (!prop) return false;

          return (
            hasGroupStatus(groups, task, "Unmatched") &&
            Option.isNone(prop.expectation) &&
            Predicate.isTagged(prop.value, "Valid")
          );
        });

        yield* attrs.setRuleTargets({ doc: rule, targets: recordsFilter() });
        yield* attrs.setRuleExpectation({ doc: rule, propId: cycle, value: required });
        yield* save(rule, task);
        yield* waitFor(latest, (groups) => {
          return (
            hasGroupStatus(groups, task, "Matching") &&
            hasPropValueState(groups, task, cycle, "Unset")
          );
        });
        expect(values.has(cycle)).toBe(false);

        // Removing the available rule projection leaves a visible saved group.
        rule.getMap("attrs").set("_tag", "note");
        yield* save(rule, task);
        yield* waitFor(latest, (groups) => hasGroupStatus(groups, task, "Unavailable"));
        expect(values.get(priority)).toEqual(AttrsSchema.PropVal.cases.number.make({ val: 2 }));
      }),
    );

    expect(observe).toHaveBeenCalledOnce();
    expect(unobserve).toHaveBeenCalledOnce();
  });

  it("reactively validates reference scope and newly loaded prop definitions", async () => {
    await runIntegration(
      Effect.gen(function* () {
        const attrs = yield* Attrs.Service;
        const person = AttrsSchema.RecordId.make("record_id:person");
        const assignee = AttrsSchema.RecordId.make("prop_id:assignee");
        const target = yield* makeDoc();
        yield* save(target, person);

        const rule = yield* makeDoc();
        yield* attrs.initializeRule({ doc: rule, targets: recordsFilter() });
        yield* attrs.setRuleExpectation({ doc: rule, propId: assignee, value: required });
        yield* save(rule, task);

        const doc = yield* makeDoc();
        yield* attrs.setProp({
          doc,
          recordId,
          propId: assignee,
          value: AttrsSchema.PropVal.cases.link.make({ val: person }),
        });
        yield* save(doc, recordId);
        const latest = yield* startWatching(doc);
        yield* waitFor(latest, (groups) => {
          return hasPropValueState(groups, undefined, assignee, "Invalid");
        });

        const definition = yield* makeDoc();
        yield* attrs.initializeProp({ doc: definition });
        yield* attrs.setPropType({ doc: definition, type: "link" });
        yield* attrs.setPropTargets({ doc: definition, targets: recordsFilter() });
        yield* save(definition, assignee);
        yield* waitFor(latest, (groups) => hasPropValueState(groups, undefined, assignee, "Valid"));

        // This title change makes the target a Page, outside the explicit Notes scope.
        const records = yield* RecordRepo.Service;
        yield* records.updateById(person, { title: "Person" });
        yield* Reactivity.invalidate(["records"]);
        yield* waitFor(latest, (groups) => {
          return hasPropValueState(groups, undefined, assignee, "Invalid");
        });

        yield* records.updateById(person, { title: null });
        yield* Reactivity.invalidate(["records"]);
        yield* waitFor(latest, (groups) => hasPropValueState(groups, undefined, assignee, "Valid"));
        // The explicit scope rejects a property target; an unset scope accepts it.
        yield* attrs.initializeProp({ doc: target });
        yield* save(target, person);
        yield* waitFor(latest, (groups) => {
          return hasPropValueState(groups, undefined, assignee, "Invalid");
        });
        yield* attrs.setPropTargets({ doc: definition, targets: undefined });
        yield* save(definition, assignee);
        yield* waitFor(latest, (groups) => hasPropValueState(groups, undefined, assignee, "Valid"));

        expect(doc.getMap("attrs").toJSON().props[assignee]).toEqual(
          AttrsSchema.PropVal.cases.link.make({ val: person }),
        );
      }),
    );
  });
});

function recordsFilter() {
  return StreamSettings.presets.notes.filter;
}

function makeDoc() {
  return Effect.acquireRelease(
    Effect.sync(() => new Y.Doc()),
    (doc) => Effect.sync(() => doc.destroy()),
  );
}

function makeNote() {
  return makeDoc().pipe(
    Effect.map((doc) => {
      getProsemirrorXmlFragment(doc).insert(0, [new Y.XmlElement("paragraph")]);

      return doc;
    }),
  );
}

function save(doc: Y.Doc, recordId: AttrsSchema.RecordId) {
  return Effect.gen(function* () {
    const events = yield* EventRepo.Service;
    yield* events.create({
      recordId,
      type: "update",
      payload: Y.encodeStateAsUpdate(doc),
      createdAt: DateTime.makeUnsafe("2026-10-14T10:00:00Z"),
    });
    const materializer = yield* Materializer.Service;
    yield* materializer.catchUp();
    yield* Reactivity.invalidate(["records", "props", "rule_expects"]);
  });
}

function startWatching(doc: Y.Doc) {
  return Effect.gen(function* () {
    const latest = yield* SubscriptionRef.make<RuleProps.EditorGroups | undefined>(undefined);
    yield* RuleProps.watch({ recordId, doc }).pipe(
      Stream.runForEach(({ groups }) => SubscriptionRef.set(latest, groups)),
      Effect.forkChild,
    );

    return latest;
  });
}

function waitFor(
  latest: SubscriptionRef.SubscriptionRef<RuleProps.EditorGroups | undefined>,
  predicate: (groups: RuleProps.EditorGroups) => boolean,
) {
  return SubscriptionRef.changes(latest).pipe(
    Stream.filter(Predicate.isNotUndefined),
    Stream.filter(predicate),
    Stream.runHead,
    Effect.flatMap(Effect.fromOption),
    Effect.timeout("5 seconds"),
  );
}

function hasGroupStatus(
  groups: RuleProps.EditorGroups,
  ruleId: AttrsSchema.RecordId,
  status: RuleProps.GroupStatus["_tag"],
) {
  return groups.groups[ruleId]?.status._tag === status;
}

function hasPropValueState(
  groups: RuleProps.EditorGroups,
  ruleId: AttrsSchema.RecordId | undefined,
  propId: AttrsSchema.RecordId,
  state: RuleProps.Prop["value"]["_tag"],
) {
  const group = Option.fromNullishOr(ruleId).pipe(
    Option.match({
      onNone: () => groups.top,
      onSome: (id) => groups.groups[id],
    }),
  );

  return group?.props[propId]?.value._tag === state;
}

type Services =
  | Attrs.Service
  | DB.Service
  | EventRepo.Service
  | Materializer.Service
  | RecordRepo.Service
  | PropDef.Service
  | RuleRecord.Service
  | SqlClient.SqlClient
  | Reactivity.Reactivity
  | Scope.Scope;

function runIntegration(program: Effect.Effect<void, unknown, Services>) {
  const services = Layer.mergeAll(
    Attrs.Service.layer,
    PropDef.Service.layer,
    RuleRecord.Service.layer,
  ).pipe(Layer.provideMerge(CliRuntime.layer));

  return Effect.runPromise(
    program.pipe(
      Effect.provide(services),
      Effect.provide(Layer.succeed(DB.Config, { localGraphId: "test", databasePath: ":memory:" })),
      Effect.provide(NodeServices.layer),
      Effect.provide(Reactivity.layer),
      Effect.scoped,
    ),
  );
}
