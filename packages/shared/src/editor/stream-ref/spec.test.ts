import { Option, Predicate, Result } from "effect";
import { describe, expect, it, vi } from "vite-plus/test";
import { AttrsSchema } from "../../attrs.schema";
import { Filters } from "../../record/filters";
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
  it("labels system stream conditions and an unrestricted filter", () => {
    expect(label(StreamSettings.systemStreams.properties.filter)).toBe("Properties · Unarchived");
    expect(label(StreamSettings.systemStreams.rules.filter)).toBe("Rules · Unarchived");
    expect(label(StreamSettings.systemStreams.presets.filter)).toBe("Presets · Unarchived");
    expect(label([])).toBe("All records");
  });

  it("preserves property violation labels and record dependencies in saved stream settings", () => {
    const settings = StreamRefSpec.decodeAttrs({
      ...StreamSettings.defaultDisplay,
      filter: [expr.cmp({ val: [["prop", project], "violation", true] })],
    });

    const registry = Filters.forStreams(
      Filters.fromDefinitions([
        { id: project, title: "Priority", prop_type: "number", prop_default: null },
      ]),
    );

    const labels = StreamRefSpec.labels(settings, registry);
    expect(StreamRefSpec.renderLabels(labels, () => "Priority")).toBe(
      'Property "Priority" violations',
    );
    expect(labels.flatMap(Filters.labelRecords)).toEqual([project]);
  });

  it("uses picker choice labels for direct comparisons", () => {
    expect(
      label([
        expr.cmp({ val: ["_tag", "=", "note"] }),
        expr.cmp({ val: ["_tag", "=", "owned"] }),
        expr.cmp({ val: ["title", "exists", false] }),
      ]),
    ).toBe("Documents · Owned records · Title is unset");
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
        expr.cmp({ val: ["_tag", "=", "note"] }),
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
        Filters.aliases.unarchived.make(),
        group,
        expr.and({ val: [expr.cmp({ val: ["title", "exists", true] })] }),
        expr.cmp({ val: ["id", "=", project] }),
      ]),
    ).toBe("Unarchived · 3 Filters");
  });

  it("keeps non-default display settings at the end", () => {
    expect(
      StreamRefSpec.renderLabels(
        StreamRefSpec.labels({
          ...StreamSettings.systemStreams.properties,
          view: "snippets",
        }),
      ),
    ).toBe("Properties · Unarchived · updated · snippets");
  });

  it("describes literal labels without record dependencies", () => {
    expect(StreamRefSpec.expressionLabel(Filters.aliases.unarchived.make())).toEqual(
      Result.succeed(StreamRefSpec.Label.Literal({ val: "Unarchived" })),
    );
  });

  it("declares record dependencies and formats their current labels", () => {
    const link = Result.getOrThrow(
      StreamRefSpec.expressionLabel(expr.cmp({ val: [["link", "->", project], "exists", true] })),
    );

    const options = Result.getOrThrow(
      StreamRefSpec.expressionLabel(Filters.enumOptions.make(project)),
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
    expect(label([Filters.enumOptions.make(project)])).toBe("Enum options · Project");
  });

  it("uses generated property labels and both record names at runtime", () => {
    const status = AttrsSchema.RecordId.make("status");
    const done = AttrsSchema.RecordId.make("done");

    const registry = Filters.fromDefinitions([
      { id: status, title: "Status", prop_type: "enum", prop_default: null },
    ]);

    const selection = Filters.property({
      id: status,
      title: "Status",
      prop_type: "enum",
      prop_default: null,
    }).entries[0]!.select(done);

    expect(Option.isSome(selection)).toBe(true);
    const filter = Option.toArray(selection);

    const labels = StreamRefSpec.labels({ ...StreamSettings.defaultDisplay, filter }, registry);
    expect(labels.flatMap(Filters.labelRecords)).toEqual([status, done]);
    expect(StreamRefSpec.renderLabels(labels, (id) => (id === status ? "Status" : "Done"))).toBe(
      "Status is Done",
    );
    expect(
      StreamRefSpec.renderLabels(labels, (id) => (id === status ? "Workflow" : "Complete")),
    ).toBe("Workflow is Complete");
    expect(
      StreamRefSpec.renderLabels(
        StreamRefSpec.labels({ ...StreamSettings.defaultDisplay, filter }),
      ),
    ).toBe("1 Filter");
  });

  it("preserves unrecognized expressions in the failure", () => {
    const expression = expr.cmp({ val: ["id", "=", project] });
    expect(StreamRefSpec.expressionLabel(expression)).toEqual(Result.fail(expression));
  });
});
