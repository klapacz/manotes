import { PaneSchema } from "@manotes/shared/note/pane.schema";
import { NodeServices } from "@effect/platform-node";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { PropDef } from "@manotes/shared/prop-def.service";
import { PropRecordRepo } from "@manotes/shared/prop-record.repo";
import { BuiltinAttrs } from "@manotes/shared/builtin-attrs";
import { EnumOptionRepo } from "@manotes/shared/enum-option.repo";
import { DB } from "@manotes/shared/db.service";
import { Tables } from "@manotes/shared/db.tables";
import { EventRepo } from "@manotes/shared/event.repo";
import * as GraphSyncContext from "@manotes/shared/graph-sync/context";
import * as GraphSyncEncryption from "@manotes/shared/graph-sync/encryption/service";
import * as GraphSyncEventLog from "@manotes/shared/graph-sync/event-log.service";
import * as Materializer from "@manotes/shared/materializer.service";
import { NoteRepo } from "@manotes/shared/note.repo";
import { NoteSchema } from "@manotes/shared/note.schema";
import { NoteDoc } from "@manotes/shared/note/doc";
import { ProsemirrorEncode } from "@manotes/shared/prosemirror/encode";
import { StreamFilter } from "@manotes/shared/note/stream-filter";
import { StreamSettings } from "@manotes/shared/note/stream-settings";
import { YSchema } from "@manotes/shared/y-schema";
import { DateTime, Effect, Layer, Option, Scope, Stream, Record, Match, Predicate } from "effect";
import * as Reactivity from "effect/unstable/reactivity/Reactivity";
import { describe, expect, it } from "vite-plus/test";
import * as Y from "yjs";
import { CliRuntime } from "./cli.runtime";

const createdAt = DateTime.makeUnsafe("2026-10-11T09:00:00Z");

describe("Archived builtin", () => {
  it("lists active enum options for one parent while preserving archived and untitled options", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const attrs = yield* Attrs.Service;
          const events = yield* EventRepo.Service;
          const materializer = yield* Materializer.Service;
          const options = yield* EnumOptionRepo.Service;
          const notes = yield* NoteRepo.Service;
          const parent = NoteSchema.Id.make("priority");

          for (const input of [
            { id: "high", parent, archived: false },
            { id: "untitled", parent, archived: false },
            { id: "old", parent, archived: true },
            { id: "other", parent: NoteSchema.Id.make("status"), archived: false },
          ]) {
            const { doc } = yield* Effect.acquireRelease(
              Effect.sync(() => NoteDoc.make()),
              ({ doc }) => Effect.sync(() => doc.destroy()),
            );

            yield* attrs.initializeEnumOption({ doc, enum_parent: input.parent });
            ProsemirrorEncode.initializeDocument({
              doc,
              content:
                input.id === "untitled"
                  ? [{ type: "paragraph" }]
                  : [
                      {
                        type: "heading",
                        attrs: { level: 1 },
                        content: [{ type: "text", text: input.id }],
                      },
                    ],
            });

            if (input.archived) {
              yield* attrs.setProp({
                doc,
                recordId: NoteSchema.Id.make(input.id),
                propId: BuiltinAttrs.archivedId,
                value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
              });
            }

            for (const ruleId of ["first", "second"]) {
              yield* attrs.setGroupProp({
                doc,
                recordId: NoteSchema.Id.make(input.id),
                ruleId: NoteSchema.Id.make(ruleId),
                propId: BuiltinAttrs.archivedId,
                value: AttrsSchema.PropVal.cases.bool.make({ val: input.archived }),
              });
            }

            yield* events.create({
              noteId: input.id,
              type: "update",
              createdAt,
              payload: Y.encodeStateAsUpdate(doc),
            });
          }

          yield* materializer.catchUp();

          const rows = Option.getOrThrow(
            yield* (yield* options.reactiveOptions({ enum_parent: parent })).pipe(Stream.runHead),
          );

          expect(rows.map(({ id }) => id).toSorted()).toEqual(["high", "untitled"]);

          const type = PaneSchema.StreamFilterType.cases.enum_option.make({ enum_parent: parent });

          const list = (props: NonNullable<NoteRepo.StreamListQuery["props"]>) => {
            return notes.reactiveStreamList({ type, props, sort: "updated" }).pipe(
              Effect.flatMap(Stream.runHead),
              Effect.map(Option.getOrThrow),
              Effect.map((rows) => rows.map(({ id }) => id).toSorted()),
            );
          };

          expect(yield* list(StreamSettings.propFilters({}))).toEqual(["high", "untitled"]);
          expect(yield* list({})).toEqual(["high", "old", "untitled"]);
          expect(yield* notes.findAllRecords()).toEqual([]);
        }).pipe(
          Effect.provide(Attrs.Service.layer),
          Effect.provide(EnumOptionRepo.Service.layer),
          Effect.provideContext(device),
        );
      }),
    );
  });

  it("lists properties independently of their title and excludes them from notes and pages", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const attrs = yield* Attrs.Service;
          const events = yield* EventRepo.Service;
          const materializer = yield* Materializer.Service;
          const notes = yield* NoteRepo.Service;

          const { doc } = yield* Effect.acquireRelease(
            Effect.sync(() => NoteDoc.make()),
            ({ doc }) => Effect.sync(() => doc.destroy()),
          );

          yield* attrs.initializeProp({
            doc,
            defaultValue: AttrsSchema.PropVal.cases.bool.make({ val: false }),
          });
          ProsemirrorEncode.initializeDocument({ doc, content: [{ type: "paragraph" }] });
          yield* events.create({
            noteId: "untitled-prop",
            type: "update",
            createdAt,
            payload: Y.encodeStateAsUpdate(doc),
          });
          yield* materializer.catchUp();

          expect((yield* notes.getById("untitled-prop")).title).toBeNull();

          const properties = Option.getOrThrow(
            yield* (yield* notes.reactiveStreamList({
              type: PaneSchema.StreamFilterType.cases.prop.make({}),
              sort: "updated",
            })).pipe(Stream.runHead),
          );

          expect(properties.map(({ id }) => id)).toEqual(["untitled-prop"]);

          for (const type of ["notes", "pages"] as const) {
            expect(
              Option.getOrThrow(
                yield* (yield* notes.reactiveStreamList({
                  type: PaneSchema.StreamFilterType.cases[type].make({}),
                  sort: "date",
                })).pipe(Stream.runHead),
              ),
            ).toEqual([]);
          }
        }).pipe(Effect.provide(Attrs.Service.layer), Effect.provideContext(device));
      }),
    );
  });

  it("blocks using invalid definitions until their default is corrected", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const attrs = yield* Attrs.Service;
          const events = yield* EventRepo.Service;
          const materializer = yield* Materializer.Service;
          const notes = yield* NoteRepo.Service;
          const definitions = yield* PropRecordRepo.Service;

          const makeDoc = () => {
            return Effect.acquireRelease(
              Effect.sync(() => NoteDoc.make()),
              ({ doc }) => Effect.sync(() => doc.destroy()),
            );
          };

          const save = (id: AttrsSchema.NoteId, doc: Y.Doc) => {
            return events
              .create({
                noteId: id,
                type: "update",
                createdAt,
                payload: Y.encodeStateAsUpdate(doc),
              })
              .pipe(Effect.andThen(materializer.catchUp()));
          };

          const propId = AttrsSchema.NoteId.make("hours");
          const prop = yield* makeDoc();
          yield* attrs.initializeProp({
            doc: prop.doc,
            defaultValue: AttrsSchema.PropVal.cases.bool.make({ val: false }),
          });
          yield* save(propId, prop.doc);

          for (const [id, value] of [
            ["unset", undefined],
            ["old-value", AttrsSchema.PropVal.cases.bool.make({ val: false })],
            ["number", AttrsSchema.PropVal.cases.number.make({ val: 7.5 })],
          ] as const) {
            const note = yield* makeDoc();
            const recordId = AttrsSchema.NoteId.make(id);

            if (value !== undefined) {
              yield* attrs.setProp({ doc: note.doc, recordId, propId, value });
            }

            yield* save(recordId, note.doc);
          }

          yield* attrs.setPropType({ doc: prop.doc, type: "number" });
          yield* save(propId, prop.doc);
          const db = yield* DB.Service;

          const stored = (yield* db.query((db) => db.select().from(Tables.notes))).find(
            (row) => row.id === propId,
          );

          expect(stored?.attrs_valid).toBe(0);
          expect(stored?.prop_default).toBe('{"_tag":"bool","val":false}');

          const defs = Option.getOrThrow(
            yield* (yield* definitions.reactiveDefs()).pipe(Stream.runHead),
          );

          expect(defs).toEqual([]);

          const properties = Option.getOrThrow(
            yield* (yield* notes.reactiveStreamList({
              type: PaneSchema.StreamFilterType.cases.prop.make({}),
              sort: "updated",
            })).pipe(Stream.runHead),
          );

          expect(properties.map(({ id }) => id)).toContain(propId);

          const ids = (val: number) => {
            return Effect.gen(function* () {
              const rows = Option.getOrThrow(
                yield* (yield* notes.reactiveStreamList({
                  type: PaneSchema.StreamFilterType.cases.notes.make({}),
                  sort: "date",
                  props: { [propId]: AttrsSchema.PropVal.cases.number.make({ val }) },
                })).pipe(Stream.runHead),
              );

              return rows.map(({ id }) => id).toSorted();
            });
          };

          expect(yield* ids(0)).toEqual(["number", "old-value", "unset"]);
          expect(yield* ids(7.5)).toEqual(["number", "old-value", "unset"]);
          yield* attrs.setPropDefault({
            doc: prop.doc,
            value: AttrsSchema.PropVal.cases.number.make({ val: 7.5 }),
          });
          yield* save(propId, prop.doc);
          expect(
            Option.getOrThrow(yield* (yield* definitions.reactiveDefs()).pipe(Stream.runHead)),
          ).toMatchObject([
            {
              id: propId,
              prop_type: "number",
              prop_default: AttrsSchema.PropVal.cases.number.make({ val: 7.5 }),
            },
          ]);
          expect(yield* ids(0)).toEqual([]);
          expect(yield* ids(7.5)).toEqual(["number", "unset"]);

          const rows = Option.getOrThrow(
            yield* (yield* notes.reactiveStreamList({
              type: PaneSchema.StreamFilterType.cases.notes.make({}),
              sort: "date",
              props: {
                [propId]: AttrsSchema.PropVal.cases.number.make({ val: 7.5 }),
                [AttrsSchema.NoteId.make("missing")]: AttrsSchema.PropVal.cases.bool.make({
                  val: true,
                }),
              },
            })).pipe(Stream.runHead),
          );

          expect(rows.map(({ id }) => id).toSorted()).toEqual(["number", "unset"]);
        }).pipe(
          Effect.provide(Attrs.Service.layer),
          Effect.provide(PropRecordRepo.Service.layer),
          Effect.provideContext(device),
        );
      }),
    );
  });

  it("filters tagged values and reacts to assignments and definition defaults", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const attrs = yield* Attrs.Service;
          const events = yield* EventRepo.Service;
          const materializer = yield* Materializer.Service;
          const notes = yield* NoteRepo.Service;

          const makeDoc = () => {
            return Effect.acquireRelease(
              Effect.sync(() => NoteDoc.make()),
              ({ doc }) => Effect.sync(() => doc.destroy()),
            );
          };

          const save = (id: AttrsSchema.NoteId, doc: Y.Doc) => {
            return events
              .create({
                noteId: id,
                type: "update",
                createdAt,
                payload: Y.encodeStateAsUpdate(doc),
              })
              .pipe(Effect.andThen(materializer.catchUp()));
          };

          const flagId = AttrsSchema.NoteId.make("flag");
          const flag = yield* makeDoc();
          yield* attrs.initializeProp({
            doc: flag.doc,
            defaultValue: AttrsSchema.PropVal.cases.bool.make({ val: true }),
          });
          yield* save(flagId, flag.doc);

          for (const [id, value] of [
            ["unset", undefined],
            ["false", AttrsSchema.PropVal.cases.bool.make({ val: false })],
            ["true", AttrsSchema.PropVal.cases.bool.make({ val: true })],
            ["wrong-kind", AttrsSchema.PropVal.cases.text.make({ val: "false" })],
          ] as const) {
            const note = yield* makeDoc();
            const recordId = AttrsSchema.NoteId.make(id);

            if (value !== undefined) {
              yield* attrs.setProp({
                doc: note.doc,
                recordId,
                propId: BuiltinAttrs.archivedId,
                value,
              });
            }

            yield* save(recordId, note.doc);
          }

          const defaults = StreamSettings.defaults(
            PaneSchema.StreamFilterType.cases.notes.make({}),
          ).filter;

          const ids = (props: NonNullable<NoteRepo.StreamListQuery["props"]>) => {
            return Effect.gen(function* () {
              const rows = Option.getOrThrow(
                yield* (yield* notes.reactiveStreamList({
                  type: PaneSchema.StreamFilterType.cases.notes.make({}),
                  sort: "date",
                  props,
                })).pipe(Stream.runHead),
              );

              return rows.map(({ id }) => id).toSorted();
            });
          };

          const defaultProps = StreamSettings.propFilters(defaults);
          expect(yield* ids(defaultProps)).toEqual(["false", "unset"]);
          expect(
            yield* ids({
              [BuiltinAttrs.archivedId]: AttrsSchema.PropVal.cases.bool.make({ val: true }),
            }),
          ).toEqual(["true"]);
          expect(yield* ids({})).toEqual(["false", "true", "unset", "wrong-kind"]);
          expect(
            yield* ids({
              ...defaultProps,
              [flagId]: AttrsSchema.PropVal.cases.bool.make({ val: true }),
            }),
          ).toEqual(["false", "unset"]);
          expect(
            yield* ids({
              ...defaultProps,
              [flagId]: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            }),
          ).toEqual([]);

          const pull = yield* Stream.toPull(
            yield* notes.reactiveStreamList({
              type: PaneSchema.StreamFilterType.cases.notes.make({}),
              sort: "date",
              props: defaultProps,
            }),
          );

          expect((yield* pull)[0]?.map(({ id }) => id).toSorted()).toEqual(["false", "unset"]);

          const changing = yield* makeDoc();
          const recordId = AttrsSchema.NoteId.make("unset");
          yield* attrs.setProp({
            doc: changing.doc,
            recordId,
            propId: BuiltinAttrs.archivedId,
            value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
          });
          yield* save(recordId, changing.doc);
          expect((yield* pull)[0]?.map(({ id }) => id)).toEqual(["false"]);

          yield* attrs.clearProp({ doc: changing.doc, propId: BuiltinAttrs.archivedId });
          yield* save(recordId, changing.doc);
          expect((yield* pull)[0]?.map(({ id }) => id).toSorted()).toEqual(["false", "unset"]);

          const prop = yield* flag.attrs.pipe(YSchema.set("_tag", "prop"));
          const flagProp = yield* prop.pipe(YSchema.set("prop_type", "bool"));

          yield* flagProp.pipe(
            YSchema.set("prop_default", AttrsSchema.PropVal.cases.bool.make({ val: false })),
          );
          yield* save(flagId, flag.doc);
          expect(
            yield* ids({
              ...defaultProps,
              [flagId]: AttrsSchema.PropVal.cases.bool.make({ val: true }),
            }),
          ).toEqual([]);
          expect(
            yield* ids({
              ...defaultProps,
              [flagId]: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            }),
          ).toEqual(["false", "unset"]);

          for (const value of [
            AttrsSchema.PropVal.cases.text.make({ val: "planned" }),
            AttrsSchema.PropVal.cases.number.make({ val: 7 }),
            AttrsSchema.PropVal.cases.enum.make({ val: AttrsSchema.NoteId.make("choice") }),
            AttrsSchema.PropVal.cases.link.make({ val: AttrsSchema.NoteId.make("person") }),
          ]) {
            const propId = AttrsSchema.NoteId.make(value._tag);
            const def = yield* makeDoc();
            yield* attrs.initializeProp({ doc: def.doc, defaultValue: value });
            yield* save(propId, def.doc);
            expect(yield* ids({ [propId]: value })).toEqual([
              "false",
              "true",
              "unset",
              "wrong-kind",
            ]);

            const note = yield* makeDoc();
            const snapshot = Option.getOrThrow(yield* notes.findById("false"));

            if (snapshot.materializedYUpdate === null) throw new Error("Missing snapshot");
            Y.applyUpdate(note.doc, snapshot.materializedYUpdate);
            yield* attrs.setProp({
              doc: note.doc,
              recordId: AttrsSchema.NoteId.make("false"),
              propId,
              value: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            });
            yield* save(AttrsSchema.NoteId.make("false"), note.doc);
            expect(yield* ids({ [propId]: value })).toEqual(["true", "unset", "wrong-kind"]);
            expect(
              yield* ids({ [propId]: AttrsSchema.PropVal.cases.bool.make({ val: false }) }),
            ).toEqual([]);
          }
        }).pipe(Effect.provide(Attrs.Service.layer), Effect.provideContext(device));
      }),
    );
  });

  it("filters across independent paths with defaults only for completely unset props", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const attrs = yield* Attrs.Service;
          const events = yield* EventRepo.Service;
          const materializer = yield* Materializer.Service;
          const notes = yield* NoteRepo.Service;
          const first = NoteSchema.Id.make("rule:first");
          const second = NoteSchema.Id.make("rule:second");

          const definitions = [
            AttrsSchema.PropVal.cases.bool.make({ val: true }),
            AttrsSchema.PropVal.cases.text.make({ val: "high" }),
            AttrsSchema.PropVal.cases.number.make({ val: 7 }),
            AttrsSchema.PropVal.cases.enum.make({ val: NoteSchema.Id.make("high") }),
            AttrsSchema.PropVal.cases.link.make({ val: NoteSchema.Id.make("person") }),
          ];

          const createDoc = () => {
            return Effect.acquireRelease(
              Effect.sync(() => NoteDoc.make()),
              ({ doc }) => Effect.sync(() => doc.destroy()),
            );
          };

          const save = (id: string, doc: Y.Doc) => {
            return events.create({
              noteId: id,
              type: "update",
              createdAt,
              payload: Y.encodeStateAsUpdate(doc),
            });
          };

          for (const value of definitions) {
            const definition = yield* createDoc();
            yield* attrs.initializeProp({ doc: definition.doc, defaultValue: value });
            yield* save(`prop:${value._tag}`, definition.doc);
          }

          for (const id of ["unset", "grouped", "repeated", "wrong-kind", "different"]) {
            const recordId = NoteSchema.Id.make(id);
            const { doc } = yield* createDoc();
            ProsemirrorEncode.initializeDocument({
              doc,
              content: [{ type: "paragraph", content: [{ type: "text", text: id }] }],
            });

            for (const value of definitions) {
              const propId = NoteSchema.Id.make(`prop:${value._tag}`);

              const wrong = Predicate.isTagged(value, "bool")
                ? AttrsSchema.PropVal.cases.number.make({ val: 1 })
                : AttrsSchema.PropVal.cases.bool.make({ val: true });

              const different = Match.value(value).pipe(
                Match.tag("bool", () => AttrsSchema.PropVal.cases.bool.make({ val: false })),
                Match.tag("text", () => AttrsSchema.PropVal.cases.text.make({ val: "low" })),
                Match.tag("number", () => AttrsSchema.PropVal.cases.number.make({ val: 8 })),
                Match.tag("enum", () => {
                  return AttrsSchema.PropVal.cases.enum.make({ val: NoteSchema.Id.make("low") });
                }),
                Match.tag("link", () => {
                  return AttrsSchema.PropVal.cases.link.make({ val: NoteSchema.Id.make("other") });
                }),
                Match.exhaustive,
              );

              if (id === "unset") continue;

              yield* attrs.setGroupProp({
                doc,
                recordId,
                propId,
                ruleId: Predicate.isTagged(value, "link") ? second : first,
                value: Match.value(id).pipe(
                  Match.when("wrong-kind", () => wrong),
                  Match.when("different", () => different),
                  Match.orElse(() => value),
                ),
              });

              if (id === "repeated") {
                yield* attrs.setProp({ doc, recordId, propId, value: wrong });
                yield* attrs.setGroupProp({ doc, recordId, ruleId: second, propId, value });
              }
            }

            yield* save(id, doc);
          }

          yield* materializer.catchUp();

          const props = Record.fromEntries(
            definitions.map((value) => [`prop:${value._tag}`, value]),
          );

          for (const filters of [
            ...definitions.map((value) => ({ [`prop:${value._tag}`]: value })),
            props,
          ]) {
            const filter = {
              type: PaneSchema.StreamFilterType.cases.notes.make({}),
              props: filters,
            };

            const rows = Option.getOrThrow(
              yield* (yield* notes.reactiveStreamList({ ...filter, sort: "updated" })).pipe(
                Stream.runHead,
              ),
            );

            expect(rows.map(({ id }) => id).toSorted()).toEqual(["grouped", "repeated", "unset"]);
            expect(
              Option.getOrThrow(
                yield* (yield* notes.reactiveSearchPreview({ search: "", filter })).pipe(
                  Stream.runHead,
                ),
              )
                .map(({ id }) => id)
                .toSorted(),
            ).toEqual(["grouped", "repeated", "unset"]);

            const found = yield* (yield* notes.reactiveFindPreviewById({
              id: "grouped",
              filter,
            })).pipe(Stream.runHead);

            expect(Option.flatten(found).pipe(Option.map(({ id }) => id))).toEqual(
              Option.some("grouped"),
            );
          }
        }).pipe(Effect.provide(Attrs.Service.layer), Effect.provideContext(device));
      }),
    );
  });

  it("sets and clears boolean assignments through ordinary update events and SQL projections", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const attrs = yield* Attrs.Service;
          const events = yield* EventRepo.Service;
          const materializer = yield* Materializer.Service;
          const defsRepo = yield* PropDef.Service;
          const db = yield* DB.Service;
          const recordId = AttrsSchema.NoteId.make("editable-note");

          const { doc } = yield* Effect.acquireRelease(
            Effect.sync(() => NoteDoc.make()),
            ({ doc }) => Effect.sync(() => doc.destroy()),
          );

          const save = () => {
            return events
              .create({
                noteId: recordId,
                type: "update",
                createdAt,
                payload: Y.encodeStateAsUpdate(doc),
              })
              .pipe(Effect.andThen(materializer.catchUp()));
          };

          yield* attrs.setProp({
            doc,
            recordId,
            propId: BuiltinAttrs.archivedId,
            value: AttrsSchema.PropVal.cases.bool.make({ val: false }),
          });
          yield* save();

          const defs = yield* (yield* defsRepo.reactiveDefs()).pipe(Stream.runHead);

          expect(Option.getOrThrow(defs)).toEqual([
            {
              id: BuiltinAttrs.archivedId,
              title: "Archived",

              prop_type: "bool",
              prop_default: AttrsSchema.PropVal.cases.bool.make({ val: false }),
            },
          ]);

          const values = db.query((db) => db.select().from(Tables.props));

          expect(yield* values).toEqual([
            {
              recordId,
              path: "[]",
              propId: BuiltinAttrs.archivedId,
              value: JSON.stringify(AttrsSchema.PropVal.cases.bool.make({ val: false })),
            },
          ]);

          yield* attrs.setProp({
            doc,
            recordId,
            propId: BuiltinAttrs.archivedId,
            value: AttrsSchema.PropVal.cases.bool.make({ val: true }),
          });
          yield* save();
          expect(yield* values).toEqual([
            {
              recordId,
              path: "[]",
              propId: BuiltinAttrs.archivedId,
              value: JSON.stringify(AttrsSchema.PropVal.cases.bool.make({ val: true })),
            },
          ]);

          yield* attrs.clearProp({ doc, propId: BuiltinAttrs.archivedId });
          yield* save();
          expect(yield* values).toEqual([]);
          expect(doc.getMap("attrs").toJSON()).toEqual({ props: {} });
        }).pipe(
          Effect.provide(Attrs.Service.layer),
          Effect.provide(PropRecordRepo.Service.layer),
          Effect.provideContext(device),
        );
      }),
    );
  });

  it("queries every def kind with matching defaults and link targets", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const events = yield* EventRepo.Service;
          const materializer = yield* Materializer.Service;
          const repo = yield* PropRecordRepo.Service;

          const values = [
            AttrsSchema.PropVal.cases.text.make({ val: "hello" }),
            AttrsSchema.PropVal.cases.number.make({ val: 7 }),
            AttrsSchema.PropVal.cases.bool.make({ val: false }),
            AttrsSchema.PropVal.cases.enum.make({ val: AttrsSchema.NoteId.make("option") }),
            AttrsSchema.PropVal.cases.link.make({ val: AttrsSchema.NoteId.make("target") }),
          ];

          const targets = StreamFilter.toAttrs({
            type: PaneSchema.StreamFilterType.cases.pages.make({}),
          });

          for (const value of values) {
            const { doc, attrs } = yield* Effect.acquireRelease(
              Effect.sync(() => NoteDoc.make()),
              ({ doc }) => Effect.sync(() => doc.destroy()),
            );

            const prop = yield* attrs.pipe(YSchema.set("_tag", "prop"));
            yield* prop.pipe(YSchema.set("prop_type", value._tag));
            yield* prop.pipe(YSchema.set("prop_default", value));

            if (AttrsSchema.PropVal.guards.link(value)) {
              const link = yield* prop.pipe(YSchema.set("prop_type", "link"));
              yield* link.pipe(YSchema.set("prop_targets", targets));
            }

            yield* events.create({
              noteId: AttrsSchema.NoteId.make(value._tag),
              type: "update",
              createdAt,
              payload: Y.encodeStateAsUpdate(doc),
            });
          }

          yield* materializer.catchUp();

          const defs = Option.getOrThrow(yield* (yield* repo.reactiveDefs()).pipe(Stream.runHead));

          expect(defs).toHaveLength(values.length);

          for (const value of values) {
            expect(defs.find((def) => def.prop_type === value._tag)).toMatchObject({
              prop_default: value,
            });
          }

          expect(defs.find((def) => def.prop_type === "link")).toMatchObject({
            prop_targets: targets,
          });
        }).pipe(Effect.provide(PropRecordRepo.Service.layer), Effect.provideContext(device));
      }),
    );
  });

  it("provides Archived without creating a record or event", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const definitions = yield* PropDef.Service;
          const events = yield* EventRepo.Service;
          const notes = yield* NoteRepo.Service;
          expect(yield* events.listAllForBackup()).toEqual([]);
          expect(yield* notes.findById(BuiltinAttrs.archivedId)).toEqual(Option.none());
          expect(
            Option.getOrThrow(yield* (yield* definitions.reactiveDefs()).pipe(Stream.runHead)),
          ).toEqual([BuiltinAttrs.archived]);
        }).pipe(Effect.provideContext(device));
      }),
    );
  });

  it("rejects builtin-prefixed IDs before inserting events", async () => {
    await run(
      Effect.gen(function* () {
        const device = yield* makeDevice();
        yield* Effect.gen(function* () {
          const events = yield* EventRepo.Service;
          const notes = yield* NoteRepo.Service;
          const materializer = yield* Materializer.Service;
          const db = yield* DB.Service;

          for (const noteId of [BuiltinAttrs.archivedId, "builtin:anything", "builtin:"]) {
            const event = {
              noteId,
              type: "update" as const,
              createdAt,
              payload: new Uint8Array([0, 0]),
            };

            const createError = yield* events.create(event).pipe(Effect.flip);
            expect(createError._tag).toBe("SchemaError");

            const importError = yield* events
              .importBackupEvents([{ ...event, noteId: "ordinary" }, event])
              .pipe(Effect.flip);

            expect(importError._tag).toBe("SchemaError");
          }

          expect(yield* events.listAllForBackup()).toEqual([]);
          expect(yield* notes.findAllRecords()).toEqual([]);

          yield* events.create({
            noteId: "ordinary",
            type: "update",
            createdAt,
            payload: new Uint8Array([0, 0]),
          });
          yield* materializer.catchUp();
          yield* materializer.catchUp();
          expect(
            (yield* db.query((db) => db.select({ id: Tables.notes.id }).from(Tables.notes))).map(
              (row) => row.id,
            ),
          ).toEqual(["ordinary"]);
          expect(yield* events.listAllForBackup()).toHaveLength(1);
          expect(
            yield* db.query((db) => {
              return db
                .select({
                  lastAppliedLocalSeq: Tables.materializationCheckpoint.lastAppliedLocalSeq,
                })
                .from(Tables.materializationCheckpoint);
            }),
          ).toEqual([{ lastAppliedLocalSeq: yield* events.getMaxLocalSeq() }]);
          expect(yield* notes.findById(BuiltinAttrs.archivedId)).toEqual(Option.none());
          expect(yield* notes.findById("ordinary")).not.toEqual(Option.none());
        }).pipe(Effect.provideContext(device));
      }),
    );
  });
});

function makeDevice() {
  const services = Layer.mergeAll(PropDef.Service.layer, GraphSyncEventLog.Service.layer).pipe(
    Layer.provideMerge(GraphSyncEncryption.Service.layer),
    Layer.provideMerge(CliRuntime.layer),
    Layer.provide(
      Layer.succeed(GraphSyncContext.Context, {
        graphId: "graph",
        graphKey: new Uint8Array(32).fill(7),
      }),
    ),
    Layer.provide(Layer.succeed(DB.Config, { localGraphId: "graph", databasePath: ":memory:" })),
    Layer.provide(NodeServices.layer),
    Layer.provide(Reactivity.layer),
    Layer.fresh,
  );

  return Layer.build(services);
}

function run(program: Effect.Effect<void, unknown, Scope.Scope>) {
  return Effect.runPromise(Effect.scoped(program));
}
