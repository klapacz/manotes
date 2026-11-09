import { RecordSchema } from "@manotes/shared/record.schema";
import type { RecordRepo } from "@manotes/shared/record.repo";
import { useAtom } from "@effect/atom-solid";
import { Array, DateTime, Effect, Match, Option, Result } from "effect";
import { nanoid } from "nanoid";
import { toast } from "somoto";
import { MaterializedEventService, bindRt } from "../../lib";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { Filters } from "@manotes/shared/record/filters";
import { PaneSchema } from "@manotes/shared/record/pane.schema";
import type { UnknownNodeJSON } from "@manotes/shared/node-json";
import type { Hotkey } from "@tanstack/hotkeys";
import { ProsemirrorEncode } from "@manotes/shared/prosemirror/encode";
import { Attrs } from "@manotes/shared/attrs.service";
import type { AttrsSchema } from "@manotes/shared/attrs.schema";
import { RecordDoc } from "@manotes/shared/record/doc";
import * as Y from "yjs";
import type { EditorPool } from "./editor-pool";

export type CreateInput = {
  date?: string;
  payload?: Uint8Array<ArrayBufferLike>;
  pane?: PaneSchema.PaneStream;
  // When given, the new record's editor is booted into the pool so the row it
  // lands in reattaches the live ProseMirror DOM instead of rebooting.
  pool?: EditorPool.Pool;
};

const CreateRecord = bindRt((rt) => {
  return rt.fn(
    Effect.fn("ComponentsRecordCreate.createRecord")(function* (input: CreateInput) {
      const service = yield* MaterializedEventService.Service;
      const payload = yield* resolvePayload(input);

      const record = yield* service.create({
        recordId: RecordSchema.Id.make(nanoid()),
        payload,
        createdAt: yield* DateTime.now,
        date: input.date,
      });

      if (input.pool) yield* input.pool.preload([record.id]);

      return record;
    }),
  );
});

const resolvePayload = Effect.fn("ComponentsRecordRecordCreate.resolvePayload")(function* (
  input: CreateInput,
) {
  if (input.payload !== undefined) return input.payload;

  if (input.pane !== undefined) return yield* prefilledPayload(input.pane);

  return ProsemirrorEncode.encodeDocument([{ type: "paragraph" }]);
});

/** Creates a record, surfacing progress through a toast and running `onCreated`. */
export function useCreateRecord() {
  const [, createRecord] = useAtom(CreateRecord, { mode: "promise" });

  return (input: CreateInput, onCreated?: (record: RecordRepo.Record) => void) => {
    return toast.promise(
      createRecord(input).then((record) => {
        onCreated?.(record);

        return record;
      }),
      {
        loading: "Creating...",
        success: () => "Record created",
        error: "Error while creating record",
      },
    );
  };
}

/** The keybinding that triggers record creation on a pane's focus node. */
export const shortcut: Hotkey[][] = [["Mod+Enter"]];

/** Builds a page payload: a record whose title materializes from a leading H1. */
export function pagePayload(title: string): Uint8Array<ArrayBufferLike> {
  return ProsemirrorEncode.encodeDocument([
    { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: title }] },
  ]);
}

/** Seeds a new record's content from the stream pane's filters. */
export const prefilledPayload = Effect.fn("ComponentsRecordRecordCreate.prefilledPayload")(
  function* (pane: PaneSchema.PaneStream) {
    const comparisons = StreamSettings.requiredComparisons(pane.filter);
    const content = Array.empty<UnknownNodeJSON>();
    const tag = Option.getOrUndefined(StreamSettings.firstTag(pane.filter));

    if (needsHeading(comparisons)) {
      content.push({
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "Untitled" }],
      });
    }

    for (const id of StreamSettings.linksTo(pane.filter)) {
      content.push({
        type: "paragraph",
        content: [{ type: "backlink", attrs: { id } }],
      });
    }

    if (content.length === 0) content.push({ type: "paragraph" });

    const { doc } = yield* Effect.acquireRelease(
      Effect.sync(() => RecordDoc.make()),
      ({ doc }) => Effect.sync(() => doc.destroy()),
    );

    yield* Effect.sync(() => ProsemirrorEncode.initializeDocument({ doc, content }));

    const attrs = yield* Attrs.Service;

    yield* Match.value(tag).pipe(
      Match.when("prop", () => attrs.initializeProp({ doc })),
      Match.when("rule", () => {
        return attrs.initializeRule({ doc, targets: StreamSettings.defaultPreset.filter });
      }),
      Match.when("owned", () => {
        return Array.findFirst(pane.filter, (expression) => {
          return Filters.enumOptions.match(expression).pipe(Result.getSuccess);
        }).pipe(
          Option.match({
            onNone: () => Effect.void,
            onSome: (enum_parent) => {
              return attrs.initializeEnumOption({ doc, enum_parent });
            },
          }),
        );
      }),
      Match.orElse(() => Effect.void),
    );

    return yield* Effect.sync(() => Y.encodeStateAsUpdate(doc));
  },
  Effect.scoped,
);

function needsHeading(comparisons: readonly AttrsSchema.FilterCmp[]): boolean {
  return Array.some(comparisons, (comparison) => {
    return Match.value(comparison).pipe(
      Match.when(["title", "exists", true], () => true),
      Match.when(["_tag", "=", Match.is("prop", "rule", "owned")], () => true),
      Match.orElse(() => false),
    );
  });
}

export * as RecordCreate from "./record-create";
