import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { BuiltinAttrs } from "@manotes/shared/builtin-attrs";
import { StreamSettings } from "@manotes/shared/note/stream-settings";
import type { PropRecordRepo } from "@manotes/shared/prop-record.repo";
import { describe, expect, it } from "vite-plus/test";
import { StreamPropFilterEntries } from "./stream-prop-filter.entries";

const archived = {
  id: BuiltinAttrs.archivedId,
  title: "Archived",
  builtin: true,
  prop_type: "bool",
  prop_default: AttrsSchema.PropVal.cases.bool.make({ val: false }),
} satisfies PropRecordRepo.Def<"bool">;

describe("property filter entries", () => {
  it("keeps default comparisons selectable while hiding their chips", () => {
    const entries = StreamPropFilterEntries.make({
      defs: [archived],
      filter: StreamSettings.defaults("notes").filter,
    });

    expect(entries).toEqual([
      {
        id: archived.id,
        def: archived,
        value: archived.prop_default,
        label: "Archived",
        detail: "False",
        modified: false,
        showChip: false,
        canClear: true,
      },
    ]);
  });

  it("marks a cleared default as modified without displaying an empty chip", () => {
    const entries = StreamPropFilterEntries.make({
      defs: [archived],
      filter: StreamSettings.changePropFilter(StreamSettings.defaults("notes").filter, {
        propId: archived.id,
        value: undefined,
      }),
    });

    expect(entries[0]).toMatchObject({
      detail: "Any",
      value: undefined,
      modified: true,
      showChip: false,
      canClear: false,
    });
  });

  it("omits filters without definitions", () => {
    const missingId = AttrsSchema.NoteId.make("missing");
    const value = AttrsSchema.PropVal.cases.bool.make({ val: false });

    const entries = StreamPropFilterEntries.make({
      defs: [archived],
      filter: StreamSettings.changePropFilter(StreamSettings.defaults("notes").filter, {
        propId: missingId,
        value,
      }),
    });

    expect(entries.map((entry) => entry.id)).toEqual([archived.id]);
  });
});
