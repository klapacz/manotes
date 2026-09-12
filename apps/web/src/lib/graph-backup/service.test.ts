import { describe, expect, it } from "vite-plus/test";
import { Effect, Schema } from "effect";
import * as BackupSchema from "./schema";
import { createBackup, getSuggestedGraphName } from "./service";

describe("graph backup service", () => {
  const decodeDateTime = Schema.decodeUnknownSync(Schema.DateTimeUtcFromString);

  it("round-trips backup data and omits localSeq and commitSeq", async () => {
    const firstCreatedAt = decodeDateTime("2026-04-01T10:00:00.000Z");
    const secondCreatedAt = decodeDateTime("2026-04-01T11:00:00.000Z");
    const exportedAt = decodeDateTime("2026-04-01T12:00:00.000Z");

    const backup = createBackup({
      sourceGraphDisplayName: "Work",
      exportedAt,
      events: [
        {
          localSeq: 4,
          noteId: "note-a",
          type: "update",
          payload: new Uint8Array([0, 1, 2, 255]),
          createdAt: firstCreatedAt,
          id: "event-a",
          commitSeq: 10,
        },
        {
          localSeq: 5,
          noteId: "note-b",
          type: "update",
          payload: new Uint8Array([9, 8, 7]),
          createdAt: secondCreatedAt,
          id: "event-b",
          commitSeq: null,
        },
      ],
    });

    const encoded = await Effect.runPromise(BackupSchema.encodeBundle(backup));
    const decoded = await Effect.runPromise(BackupSchema.decodeBundle(encoded));

    expect(encoded.events).toEqual([
      {
        noteId: "note-a",
        type: "update",
        payload: "AAEC/w==",
        createdAt: "2026-04-01T10:00:00.000Z",
        id: "event-a",
      },
      {
        noteId: "note-b",
        type: "update",
        payload: "CQgH",
        createdAt: "2026-04-01T11:00:00.000Z",
        id: "event-b",
      },
    ]);

    expect(decoded).toEqual(backup);
    expect(decoded.events).toEqual([
      {
        noteId: "note-a",
        type: "update",
        payload: new Uint8Array([0, 1, 2, 255]),
        createdAt: firstCreatedAt,
        id: "event-a",
      },
      {
        noteId: "note-b",
        type: "update",
        payload: new Uint8Array([9, 8, 7]),
        createdAt: secondCreatedAt,
        id: "event-b",
      },
    ]);
  });

  it("rejects unsupported backup versions", async () => {
    await expect(
      Effect.runPromise(
        BackupSchema.decodeBundle({
          version: 2,
          exportedAt: "2026-04-01T12:00:00.000Z",
          sourceGraphDisplayName: "Work",
          events: [],
        }),
      ),
    ).rejects.toThrow();
  });

  it("falls back to the filename stem when backup metadata has no name", async () => {
    const backup = await Effect.runPromise(
      BackupSchema.decodeBundle({
        version: 1,
        exportedAt: "2026-04-01T12:00:00.000Z",
        sourceGraphDisplayName: "   ",
        events: [],
      }),
    );

    expect(
      getSuggestedGraphName({
        backup,
        fileName: "work-backup.manotes-events.json",
      }),
    ).toBe("work-backup.manotes-events");
  });
});
