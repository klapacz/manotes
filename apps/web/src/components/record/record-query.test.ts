import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { Filters } from "@manotes/shared/record/filters";
import { RecordFormat } from "@manotes/shared/record/format";
import { RecordRepo } from "@manotes/shared/record.repo";
import { RecordSchema } from "@manotes/shared/record.schema";
import { DateTime, Effect, Layer, Option, Stream } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { RecordQuery } from "./record-query";

const now = DateTime.makeUnsafe("2026-10-15T12:00:00.000Z");

function preview(opts: {
  id: string;
  tag: AttrsSchema.RecordTag;
  title: string | null;
  text: string;
}): RecordRepo.Preview {
  return {
    id: RecordSchema.Id.make(opts.id),
    _tag: opts.tag,
    title: opts.title,
    text: opts.text,
    date: "2026-10-15",
    createdAt: now,
    updatedAt: now,
  };
}

function repoLayer(records: readonly RecordRepo.Preview[]) {
  return Layer.mock(RecordRepo.Service)({
    reactiveSearchPreview: () => Effect.succeed(Stream.succeed(records)),
  });
}

describe("RecordQuery", () => {
  it("prioritizes notes within each match tier while keeping title matches above body matches", async () => {
    const records = [
      preview({ id: "prop-title", tag: "prop", title: "Alpha", text: "Alpha" }),
      preview({ id: "note-title", tag: "note", title: "Alpha", text: "Alpha" }),
      preview({ id: "note-body", tag: "note", title: "Draft", text: "Mentions alpha" }),
      preview({ id: "rule-body", tag: "rule", title: "Check", text: "Mentions alpha" }),
    ];

    const matches = Option.getOrThrow(
      await Effect.runPromise(
        RecordQuery.query({ text: "alpha" }).pipe(
          Stream.runHead,
          Effect.scoped,
          Effect.provide(repoLayer(records)),
        ),
      ),
    );

    const byId = new Map(matches.map((match) => [match.value.value, match.score]));

    expect(byId.get(RecordSchema.Id.make("note-title"))!).toBeGreaterThan(
      byId.get(RecordSchema.Id.make("prop-title"))!,
    );
    expect(byId.get(RecordSchema.Id.make("prop-title"))!).toBeGreaterThan(
      byId.get(RecordSchema.Id.make("note-body"))!,
    );
    expect(byId.get(RecordSchema.Id.make("note-body"))!).toBeGreaterThan(
      byId.get(RecordSchema.Id.make("rule-body"))!,
    );
  });

  it("adds kind badges only for non-note records when unscoped", async () => {
    const records = [
      preview({ id: "n", tag: "note", title: "Note", text: "Note" }),
      preview({ id: "p", tag: "prop", title: "Priority", text: "Priority" }),
      preview({ id: "o", tag: "owned", title: "High", text: "High" }),
      preview({ id: "r", tag: "rule", title: "Tasks", text: "Tasks" }),
      preview({ id: "s", tag: "preset", title: "Inbox", text: "Inbox" }),
    ];

    const matches = Option.getOrThrow(
      await Effect.runPromise(
        RecordQuery.query({ text: "" }).pipe(
          Stream.runHead,
          Effect.scoped,
          Effect.provide(repoLayer(records)),
        ),
      ),
    );

    expect(matches.map((match) => match.value.badge)).toEqual([
      undefined,
      "Property",
      "Owned",
      "Rule",
      "Preset",
    ]);
    expect(RecordFormat.kindLabel("note")).toBeUndefined();
    expect(RecordFormat.kindLabel("prop")).toBe("Property");
    expect(RecordFormat.kindLabel("owned")).toBe("Owned");
    expect(RecordFormat.kindLabel("rule")).toBe("Rule");
    expect(RecordFormat.kindLabel("preset")).toBe("Preset");
  });

  it("hides kind badges when the filter already pins _tag", async () => {
    const records = [
      preview({ id: "r", tag: "rule", title: "Tasks", text: "Tasks" }),
      preview({ id: "o", tag: "owned", title: "High", text: "High" }),
    ];

    const ruleMatches = Option.getOrThrow(
      await Effect.runPromise(
        RecordQuery.scoped({
          filter: [AttrsSchema.makeFilterExpr.cmp({ val: ["_tag", "=", "rule"] })],
        })({ text: "" }).pipe(Stream.runHead, Effect.scoped, Effect.provide(repoLayer(records))),
      ),
    );

    expect(ruleMatches.every((match) => match.value.badge === undefined)).toBe(true);

    const enumMatches = Option.getOrThrow(
      await Effect.runPromise(
        RecordQuery.scoped({
          filter: [Filters.enumOptions.make(AttrsSchema.RecordId.make("status"))],
        })({ text: "" }).pipe(Stream.runHead, Effect.scoped, Effect.provide(repoLayer(records))),
      ),
    );

    expect(enumMatches.every((match) => match.value.badge === undefined)).toBe(true);
  });
});
