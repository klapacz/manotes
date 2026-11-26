import { NodeCrypto, NodeServices } from "@effect/platform-node";
import { AttrsSchema } from "@manotes/shared/attrs.schema";
import { DB } from "@manotes/shared/db.service";
import { EventRepo } from "@manotes/shared/event.repo";
import { GraphBackupSchema } from "@manotes/shared/graph-backup/schema";
import { Materializer } from "@manotes/shared/materializer.service";
import { PresetRecordRepo } from "@manotes/shared/preset-record.repo";
import { RecordRepo } from "@manotes/shared/record.repo";
import { StreamSettings } from "@manotes/shared/record/stream-settings";
import { Effect, Layer, Option } from "effect";
import { Reactivity } from "effect/reactivity";
import { expect, it } from "vite-plus/test";
import { ENTRIES, PAGES } from "../scripts/demo-content";
import { bundle } from "../scripts/generate-demo-graph";
import { CliRuntime } from "./cli.runtime";

it("imports untitled Notes and titled Pages presets with Notes as default", async () => {
  await Effect.runPromise(
    Effect.gen(function* () {
      const file = yield* GraphBackupSchema.encodeFile(bundle);
      const imported = yield* GraphBackupSchema.decodeFile(file);
      const events = yield* EventRepo.Service;
      yield* events.importBackupEvents(imported.events);
      yield* (yield* Materializer.Service).catchUp();

      const presets = yield* (yield* PresetRecordRepo.Service).listDefs();
      expect(presets.map(({ title }) => title)).toEqual(["Notes", "Pages"]);
      expect(Option.getOrThrow(PresetRecordRepo.findDefault(presets)).title).toBe("Notes");

      const records = yield* RecordRepo.Service;
      const notes = presets.find(({ title }) => title === "Notes")!;
      const pages = presets.find(({ title }) => title === "Pages")!;
      expect(notes.preset_filter).toEqual([
        ...StreamSettings.defaultFilter,
        AttrsSchema.makeFilterExpr.cmp({ val: ["title", "exists", false] }),
      ]);
      expect(pages.preset_default).toBe(false);

      const noteRows = yield* records.list({ filter: notes.preset_filter });
      expect(noteRows).toHaveLength(ENTRIES.length);
      expect(noteRows.every(({ _tag, title }) => _tag === "note" && title === null)).toBe(true);

      const pageRows = yield* records.list({ filter: pages.preset_filter });
      expect(pageRows).toHaveLength(Object.keys(PAGES).length);
      expect(pageRows.map(({ title }) => title)).toEqual(
        expect.arrayContaining(Object.values(PAGES).map(({ title }) => title)),
      );
    }).pipe(
      Effect.provide(PresetRecordRepo.Service.layer.pipe(Layer.provideMerge(CliRuntime.layer))),
      Effect.provideService(DB.Config, { localGraphId: "demo-test", databasePath: ":memory:" }),
      Effect.provide(NodeServices.layer),
      Effect.provide(NodeCrypto.layer),
      Effect.provide(Reactivity.layer),
      Effect.scoped,
    ),
  );
});
