import { Effect } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import * as Y from "yjs";
import * as MaterializedEventService from "../../lib/materialized-event.service";
import { NoteSchema } from "@manotes/shared/note.schema";
import { PaneSchema } from "@manotes/shared/note/pane.schema";
import { Attrs } from "@manotes/shared/attrs.service";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { NoteDoc } from "@manotes/shared/note/doc";
import { YSchema } from "@manotes/shared/y-schema";
import { yDocToNodeJSON } from "@manotes/shared/prosemirror-materializer.utils";
import { NOTE_SCHEMA } from "@manotes/shared/prosemirror/app-schema";
import { MdSerialize } from "@manotes/shared/prosemirror/md/serialize";
import { prefilledPayload, useCreateNote, type CreateInput } from "./note-create";

vi.mock("../../lib", () => ({
  MaterializedEventService,
  bindRt:
    <T>(creator: (rt: { fn: <A>(value: A) => A }) => T) =>
    () =>
      creator({ fn: (value) => value }),
}));

vi.mock("@effect/atom-solid", () => ({
  useAtom: (
    bound: () => (
      input: CreateInput,
    ) => Effect.Effect<NoteSchema.Record, unknown, MaterializedEventService.Service>,
  ) => [
    undefined,
    (input: CreateInput) =>
      Effect.runPromise(
        bound()(input).pipe(
          Effect.provideService(
            MaterializedEventService.Service,
            MaterializedEventService.Service.of({
              create: (input) =>
                Effect.sync(() => {
                  expectBlankPayload(input.payload);

                  return {
                    id: NoteSchema.Id.make(input.noteId),
                    title: null,
                    content: { type: "doc", content: [{ type: "paragraph" }] },
                    text: "",
                    date: "2026-10-08",
                    materializedYUpdate: input.payload,
                    createdAt: input.createdAt,
                    updatedAt: input.createdAt,
                    lastEventLocalSeq: 1,
                  };
                }),
              setDate: () => Effect.die("Unexpected date edit"),
            }),
          ),
        ),
      ),
  ],
}));

vi.mock("somoto", () => ({ toast: { promise: <T>(promise: Promise<T>) => promise } }));

describe("blank note creation", () => {
  it("seeds a property with an editable title and false default in the same Yjs update", () => {
    const payload = Effect.runSync(
      prefilledPayload(
        PaneSchema.Pane.cases.stream.make({
          paneId: PaneSchema.Id.make("prop"),
          filter: { type: "prop" },
          sort: "updated",
          view: "full",
        }),
      ).pipe(Effect.provide(Attrs.Service.layer)),
    );

    const { doc, attrs } = NoteDoc.make();

    try {
      Y.applyUpdate(doc, payload);
      expect(Effect.runSync(YSchema.exportStrict(attrs))).toEqual(
        AttrsSchema.PropAttrs.cases.bool.make({
          prop_type: "bool",
          prop_default: AttrsSchema.PropVal.cases.bool.make({ val: false }),
        }),
      );
      expect(yDocToNodeJSON({ yDoc: doc })).toEqual({
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
    useCreateNote()({}, onCreated);
    await vi.waitFor(() => expect(onCreated).toHaveBeenCalledOnce());
  });

  it("seeds an ordinary stream with an empty paragraph", () => {
    expectBlankPayload(
      Effect.runSync(
        prefilledPayload(
          PaneSchema.Pane.cases.stream.make({
            paneId: PaneSchema.Id.make("stream"),
            filter: { type: "notes" },
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
    const content = yDocToNodeJSON({ yDoc });
    expect(content).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
    const doc = NOTE_SCHEMA.nodeFromJSON(content);
    doc.check();
    expect(MdSerialize.serialize(doc)).toBe("<!-- manotes:empty-paragraph -->\n");
  } finally {
    yDoc.destroy();
  }
}
