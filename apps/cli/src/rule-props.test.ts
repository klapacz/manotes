import { NodeServices } from "@effect/platform-node";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { DB } from "@manotes/shared/db.service";
import { EventRepo } from "@manotes/shared/event.repo";
import * as Materializer from "@manotes/shared/materializer.service";
import { NoteRepo } from "@manotes/shared/note.repo";
import { PaneSchema } from "@manotes/shared/note/pane.schema";
import { StreamFilter } from "@manotes/shared/note/stream-filter";
import { PropDef } from "@manotes/shared/prop-def.service";
import { RuleProps } from "@manotes/shared/rule-props";
import { RuleRecord } from "@manotes/shared/rule-record.service";
import {
  DateTime,
  Effect,
  Layer,
  Option,
  Predicate,
  Record,
  Stream,
  SubscriptionRef,
  type Scope,
} from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import { CliRuntime } from "./cli.runtime";

const priority = AttrsSchema.NoteId.make("prop_id:priority");

const cycle = AttrsSchema.NoteId.make("prop_id:cycle");

const task = AttrsSchema.NoteId.make("rule_id:task");

const recordId = AttrsSchema.NoteId.make("record_id:issue");

const required = AttrsSchema.RuleExpectation.cases.required.make({});

describe("reactive rule props pipeline", () => {
  it("follows saved Yjs values, target edits, expectations and rule availability without writing attrs", async () => {
    const root = new Y.Doc();
    const observe = vi.spyOn(root.getMap("attrs"), "observeDeep");
    const unobserve = vi.spyOn(root.getMap("attrs"), "unobserveDeep");

    await runIntegration(
      Effect.gen(function* () {
        const doc = yield* Effect.acquireRelease(Effect.succeed(root), (doc) =>
          Effect.sync(() => doc.destroy()),
        );

        const attrs = yield* Attrs.Service;
        const definition = yield* makeDoc();
        yield* attrs.initializeProp({
          doc: definition,
          defaultValue: AttrsSchema.PropVal.cases.number.make({ val: 0 }),
        });
        yield* save(definition, priority);

        const rule = yield* makeDoc();
        yield* attrs.initializeRule({ doc: rule, targets: notesFilter() });
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

        const initial = yield* waitFor(
          latest,
          (groups) =>
            hasGroupStatus(groups, task, "Matching") &&
            hasPropValueState(groups, task, priority, "Valid"),
        );

        expect(Record.keys(initial.groups)).toEqual([task]);
        expect(initial.top.props[AttrsSchema.NoteId.make("prop_id:custom")]).toMatchObject({
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
          targets: StreamFilter.toAttrs({ type: PaneSchema.StreamFilterType.cases.pages.make({}) }),
        });
        yield* save(rule, task);
        yield* waitFor(latest, (groups) => {
          const prop = groups.groups[task]?.props[priority];

          if (!prop) {
            return false;
          }

          return (
            hasGroupStatus(groups, task, "Unmatched") &&
            Option.isNone(prop.expectation) &&
            Predicate.isTagged(prop.value, "Valid")
          );
        });

        yield* attrs.setRuleTargets({ doc: rule, targets: notesFilter() });
        yield* attrs.setRuleExpectation({ doc: rule, propId: cycle, value: required });
        yield* save(rule, task);
        yield* waitFor(
          latest,
          (groups) =>
            hasGroupStatus(groups, task, "Matching") &&
            hasPropValueState(groups, task, cycle, "Unset"),
        );
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
        const person = AttrsSchema.NoteId.make("record_id:person");
        const assignee = AttrsSchema.NoteId.make("prop_id:assignee");
        const target = yield* makeDoc();
        yield* save(target, person);

        const rule = yield* makeDoc();
        yield* attrs.initializeRule({ doc: rule, targets: notesFilter() });
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
        yield* waitFor(latest, (groups) =>
          hasPropValueState(groups, undefined, assignee, "Invalid"),
        );

        const definition = yield* makeDoc();
        yield* attrs.initializeProp({ doc: definition });
        yield* attrs.setPropType({ doc: definition, type: "link" });
        yield* save(definition, assignee);
        yield* waitFor(latest, (groups) => hasPropValueState(groups, undefined, assignee, "Valid"));

        // This title change makes the target a Page, outside the default Notes scope.
        const notes = yield* NoteRepo.Service;
        yield* notes.updateById(person, { title: "Person" });
        yield* Reactivity.invalidate(["notes"]);
        yield* waitFor(latest, (groups) =>
          hasPropValueState(groups, undefined, assignee, "Invalid"),
        );

        yield* notes.updateById(person, { title: null });
        yield* Reactivity.invalidate(["notes"]);
        yield* waitFor(latest, (groups) => hasPropValueState(groups, undefined, assignee, "Valid"));
        expect(doc.getMap("attrs").toJSON().props[assignee]).toEqual(
          AttrsSchema.PropVal.cases.link.make({ val: person }),
        );
      }),
    );
  });
});

function notesFilter() {
  return StreamFilter.toAttrs({ type: PaneSchema.StreamFilterType.cases.notes.make({}) });
}

function makeDoc() {
  return Effect.acquireRelease(
    Effect.sync(() => new Y.Doc()),
    (doc) => Effect.sync(() => doc.destroy()),
  );
}

function save(doc: Y.Doc, noteId: AttrsSchema.NoteId) {
  return Effect.gen(function* () {
    const events = yield* EventRepo.Service;
    yield* events.create({
      noteId,
      type: "update",
      payload: Y.encodeStateAsUpdate(doc),
      createdAt: DateTime.makeUnsafe("2026-10-14T10:00:00Z"),
    });
    const materializer = yield* Materializer.Service;
    yield* materializer.catchUp();
    yield* Reactivity.invalidate(["notes", "props", "rule_expects"]);
  });
}

function startWatching(doc: Y.Doc) {
  return Effect.gen(function* () {
    const latest = yield* SubscriptionRef.make<RuleProps.EditorGroups | undefined>(undefined);
    yield* RuleProps.watch({ recordId, doc }).pipe(
      Stream.runForEach((groups) => SubscriptionRef.set(latest, groups)),
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
  ruleId: AttrsSchema.NoteId,
  status: RuleProps.GroupStatus["_tag"],
) {
  return groups.groups[ruleId]?.status._tag === status;
}

function hasPropValueState(
  groups: RuleProps.EditorGroups,
  ruleId: AttrsSchema.NoteId | undefined,
  propId: AttrsSchema.NoteId,
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
  | NoteRepo.Service
  | PropDef.Service
  | RuleRecord.Service
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
