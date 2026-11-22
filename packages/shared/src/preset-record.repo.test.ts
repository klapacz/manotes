import { Option } from "effect";
import { describe, expect, it } from "vite-plus/test";
import { PresetRecordRepo } from "./preset-record.repo";
import { RecordSchema } from "./record.schema";

const makeDef = (id: string, preset_default: boolean): PresetRecordRepo.Def => ({
  id: RecordSchema.Id.make(id),
  title: id,
  preset_filter: [],
  preset_default,
});

describe("PresetRecordRepo.findDefault", () => {
  it("returns Option.none() when no presets are marked default", () => {
    expect(PresetRecordRepo.findDefault([])).toEqual(Option.none());
    expect(PresetRecordRepo.findDefault([makeDef("a", false), makeDef("b", false)])).toEqual(
      Option.none(),
    );
  });

  it("returns the single default preset", () => {
    const preset = makeDef("inbox", true);
    expect(PresetRecordRepo.findDefault([makeDef("a", false), preset])).toEqual(
      Option.some(preset),
    );
  });

  it("deterministically tie-breaks multiple defaults by id ascending", () => {
    const b = makeDef("preset-b", true);
    const a = makeDef("preset-a", true);
    const c = makeDef("preset-c", true);

    expect(PresetRecordRepo.findDefault([b, c, a])).toEqual(Option.some(a));
    expect(PresetRecordRepo.findDefault([c, a, b])).toEqual(Option.some(a));
  });
});
