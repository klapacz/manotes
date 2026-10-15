import type { RecordRepo } from "@manotes/shared/record.repo";
import { Data, Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import { MaterializedEventService } from "../../lib/materialized-event.service";
import { RecordSchema } from "@manotes/shared/record.schema";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { RecordDoc } from "@manotes/shared/record/doc";
import { YSchema } from "@manotes/shared/y-schema";
import { ProsemirrorMaterializer } from "@manotes/shared/prosemirror-materializer.utils";
import { RECORD_SCHEMA } from "@manotes/shared/prosemirror/app-schema";
import { MdSerialize } from "@manotes/shared/prosemirror/md/serialize";
import { prefilledPayload, useCreateRecord, type CreateInput } from "./record-create";

vi.mock("../../lib", () => ({
  MaterializedEventService,
  bindRt: <T>(creator: (rt: { fn: <A>(value: A) => A }) => T) => {
    return () => {
      return creator({ fn: (value) => value });
    };
  },
}));

vi.mock("@effect/atom-solid", () => ({
  useAtom: (
    bound: () => (
      input: CreateInput,
    ) => Effect.Effect<RecordRepo.Record, unknown, MaterializedEventService.Service>,
  ) => {
    return [
      undefined,
      (input: CreateInput) => {
        return Effect.runPromise(
          bound()(input).pipe(
            Effect.provideService(
              MaterializedEventService.Service,
              MaterializedEventService.Service.of({
                create: (input) => {
                  return Effect.sync(() => {
                    expectBlankPayload(input.payload);

                    return {
                      id: RecordSchema.Id.make(input.recordId),
                      title: null,
                      content: { type: "doc", content: [{ type: "paragraph" }] },
                      text: "",
                      date: "2026-10-08",
                      materializedYUpdate: input.payload,
                      createdAt: input.createdAt,
                      updatedAt: input.createdAt,
                      lastEventLocalSeq: 1,
                    };
                  });
                },
                setDate: () => Effect.die("Unexpected date edit"),
              }),
            ),
          ),
        );
      },
    ];
  },
}));

vi.mock("somoto", () => ({ toast: { promise: <T>(promise: Promise<T>) => promise } }));

describe("blank record creation", () => {
  it("creates a rule with default Notes targets and an empty expectations map", () => {
    const payload = Effect.runSync(
      prefilledPayload(
        PaneSchema.Pane.cases.stream.make({
          paneId: PaneSchema.Id.make("rules"),
          filter: { type: PaneSchema.StreamFilterType.cases.rule.make({}) },
          sort: "updated",
          view: "full",
        }),
      ).pipe(Effect.provide(Attrs.Service.layer)),
    );

    const { doc, attrs } = RecordDoc.make();
    const filter = Data.taggedEnum<AttrsSchema.TargetFilterExpr>();

    try {
      Y.applyUpdate(doc, payload);
      expect(Effect.runSync(YSchema.exportStrict(attrs))).toEqual(
        Data.taggedEnum<AttrsSchema.Attrs>().rule({
          props: {},
          rule_storage: AttrsSchema.RuleStorage.cases.top.make({}),
          rule_expects: {},
          rule_targets: [
            filter.cmp({ val: ["_tag", "=", "note"] }),
            filter.cmp({ val: ["title", "exists", false] }),
            filter.cmp({
              val: [
                ["prop", AttrsSchema.RecordId.make("builtin:archived")],
                "=",
                AttrsSchema.PropVal.cases.bool.make({ val: false }),
              ],
            }),
          ],
        }),
      );
      expect(ProsemirrorMaterializer.yDocToNodeJSON({ yDoc: doc })).toMatchObject({
        content: [{ type: "heading", attrs: { level: 1 }, content: [{ text: "Untitled" }] }],
      });
    } finally {
      doc.destroy();
    }
  });

  it("creates an owned enum option with its parent and editable title in one update", () => {
    const enum_parent = RecordSchema.Id.make("priority");

    const payload = Effect.runSync(
      prefilledPayload(
        PaneSchema.Pane.cases.stream.make({
          paneId: PaneSchema.Id.make("options"),
          filter: { type: PaneSchema.StreamFilterType.cases.enum_option.make({ enum_parent }) },
          sort: "updated",
          view: "full",
        }),
      ).pipe(Effect.provide(Attrs.Service.layer)),
    );

    const { doc, attrs } = RecordDoc.make();

    try {
      Y.applyUpdate(doc, payload);
      const snapshot = Effect.runSync(YSchema.exportStrict(attrs));
      expect(snapshot._tag).toBe("owned");
      expect(snapshot).toMatchObject({
        owned_type: "enum_option",
        owned_parent: enum_parent,
        props: {},
      });
      expect(ProsemirrorMaterializer.yDocToNodeJSON({ yDoc: doc })).toMatchObject({
        content: [{ type: "heading", attrs: { level: 1 }, content: [{ text: "Untitled" }] }],
      });
    } finally {
      doc.destroy();
    }
  });

  it("seeds a bool property with an editable title and no default in the same Yjs update", () => {
    const payload = Effect.runSync(
      prefilledPayload(
        PaneSchema.Pane.cases.stream.make({
          paneId: PaneSchema.Id.make("prop"),
          filter: { type: PaneSchema.StreamFilterType.cases.prop.make({}) },
          sort: "updated",
          view: "full",
        }),
      ).pipe(Effect.provide(Attrs.Service.layer)),
    );

    const { doc, attrs } = RecordDoc.make();

    try {
      Y.applyUpdate(doc, payload);
      expect(Effect.runSync(YSchema.exportStrict(attrs))).toEqual(
        AttrsSchema.PropAttrs.cases.bool.make({
          prop_type: "bool",
        }),
      );
      expect(ProsemirrorMaterializer.yDocToNodeJSON({ yDoc: doc })).toEqual({
        type: "doc",
        content: [
          { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "Untitled" }] },
        ],
      });
    } finally {
      doc.destroy();
    }
  });

  it("persists an empty paragraph before editor preload", async () => {
    const onCreated = vi.fn();
    useCreateRecord()({}, onCreated);
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
  });

  it("seeds an ordinary stream with an empty paragraph", () => {
    expectBlankPayload(
      Effect.runSync(
        prefilledPayload(
          PaneSchema.Pane.cases.stream.make({
            paneId: PaneSchema.Id.make("stream"),
            filter: { type: PaneSchema.StreamFilterType.cases.notes.make({}) },
            sort: "date",
            view: "full",
          }),
        ).pipe(Effect.provide(Attrs.Service.layer)),
      ),
    );
  });
});

function expectBlankPayload(payload: Uint8Array<ArrayBufferLike>): void {
  const yDoc = new Y.Doc();

  try {
    Y.applyUpdate(yDoc, payload);
    const content = ProsemirrorMaterializer.yDocToNodeJSON({ yDoc });
    expect(content).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    const doc = RECORD_SCHEMA.nodeFromJSON(content);
    doc.check();
    expect(MdSerialize.serialize(doc)).toBe("<!-- manotes:empty-paragraph -->\n");
  } finally {
    yDoc.destroy();
  }
}
