import { Predicate, Result } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import { AttrsSchema } from "../../attrs.schema";
import { StreamSettings } from "../../record/stream-settings";
import { StreamRefSpec } from "./spec";

const expr = AttrsSchema.makeFilterExpr;

const project = AttrsSchema.RecordId.make("project");

function label(filter: AttrsSchema.Filter) {
  return StreamRefSpec.renderLabels(
    StreamRefSpec.labels({ ...StreamSettings.defaultDisplay, filter }),
    () => "Project",
  );
}

describe("simple stream-ref labels", () => {
  it("labels the default conditions and an unrestricted filter", () => {
    expect(label(StreamSettings.defaultPreset.filter)).toBe("Notes · Unarchived");
    expect(label([StreamSettings.conditions.pages])).toBe("Pages");
    expect(label([])).toBe("All records");
  });

  it("shows top-level search, links, and date comparisons", () => {
    expect(
      label([
        expr.cmp({ val: ["body", "contains", "alpha"] }),
        expr.cmp({ val: [["link", "->", project], "exists", true] }),
        expr.cmp({ val: [["link", "<-", project], "exists", true] }),
        expr.cmp({ val: ["date", "=", "2026-10-15"] }),
      ]),
    ).toBe("“alpha” · Links to Project · Links from Project · 2026-10-15");
  });

  it("counts each unknown top-level group once without expanding its children", () => {
    const group = expr.or({
      val: [
        StreamSettings.conditions.notes,
        expr.cmp({ val: [["link", "->", project], "exists", true] }),
      ],
    });

    const recordLabel = vi.fn(() => "Project");
    expect(
      StreamRefSpec.renderLabels(
        StreamRefSpec.labels({ ...StreamSettings.defaultDisplay, filter: [group] }),
        recordLabel,
      ),
    ).toBe("1 Filter");
    expect(recordLabel).not.toHaveBeenCalled();
    expect(
      label([
        StreamSettings.conditions.unarchived,
        group,
        expr.and({ val: [StreamSettings.conditions.pages] }),
        expr.cmp({ val: ["id", "=", project] }),
      ]),
    ).toBe("Unarchived · 3 Filters");
  });

  it("keeps non-default display settings at the end", () => {
    expect(
      StreamRefSpec.renderLabels(
        StreamRefSpec.labels({
          ...StreamSettings.defaultPreset,
          sort: "updated",
          view: "snippets",
        }),
      ),
    ).toBe("Notes · Unarchived · updated · snippets");
  });

  it("describes literal labels without record dependencies", () => {
    expect(StreamRefSpec.expressionLabel(StreamSettings.conditions.notes)).toEqual(
      Result.succeed(StreamRefSpec.Label.Literal({ val: "Notes" })),
    );
  });

  it("declares record dependencies and formats their current labels", () => {
    const link = Result.getOrThrow(
      StreamRefSpec.expressionLabel(expr.cmp({ val: [["link", "->", project], "exists", true] })),
    );

    const options = Result.getOrThrow(
      StreamRefSpec.expressionLabel(StreamSettings.enumOptions(project)),
    );

    if (!Predicate.isTagged(link, "Record") || !Predicate.isTagged(options, "Record")) {
      throw new Error("Expected record dependencies");
    }

    expect(link.id).toBe(project);
    expect(options.id).toBe(project);
    expect(StreamRefSpec.renderLabels([link, options])).toBe(
      "Links to project · Enum options · project",
    );
    expect(StreamRefSpec.renderLabels([link, options], () => "Priority")).toBe(
      "Links to Priority · Enum options · Priority",
    );
    expect(StreamRefSpec.renderLabels([link, options], () => "Renamed")).toBe(
      "Links to Renamed · Enum options · Renamed",
    );
    expect(label([StreamSettings.enumOptions(project)])).toBe("Enum options · Project");
  });

  it("preserves unrecognized expressions in the failure", () => {
    const expression = expr.cmp({ val: ["id", "=", project] });
    expect(StreamRefSpec.expressionLabel(expression)).toEqual(Result.fail(expression));
  });
});
