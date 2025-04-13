import { ProseUtils } from "@/lib/prose.utils";
import { db } from "@/sqlocal/client";
import type { NotesTable } from "@/sqlocal/schema";
import type { JSONContent } from "@tiptap/core";
import { formatISO, endOfMonth, eachDayOfInterval, format } from "date-fns";
import type { Insertable, Selectable } from "kysely";
import { nanoid } from "nanoid";
import { getClientId } from "@/sqlocal/migrations/2025-04-05";
import * as Y from "yjs";
import { YjsUtils } from "@/lib/yjs.utils";
import { RouterInput, RouterOutput, trpcClient } from "@/lib/trpc";
import { toast } from "sonner";
import { VectorClock } from "worker/do/schema";
import { BacklinkService } from "./backlink.service";
import { TagService } from "./tag.service";
import { NoteUpdateDownstreamMessage } from "@/schemas/ws";

export namespace NoteService {
  export type Record = Selectable<NotesTable>;

  type CreateParams = {
    title?: string;
  };
  export async function create(params: CreateParams): Promise<Record> {
    const title = params.title?.trim() ? params.title.trim() : "Untitled";

    const emptyNoteJson = getEmptyNoteJSON(title);
    const ydoc = YjsUtils.prosemirrorJSONToYDoc(emptyNoteJson);
    const clientId = getClientId();

    const note = await db
      .insertInto("notes")
      .values({
        id: nanoid(),
        title: title,
        content: Y.encodeStateAsUpdate(ydoc),
        daily_at: null,
        vector_clock: JSON.stringify({ [clientId]: 0 }),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return note;
  }

  export type UpdateParams = {
    ydoc: Y.Doc;
    noteId: string;
    vector_clock: VectorClock;
    shouldIncrementVectorClock: boolean;
  };

  export async function update(params: UpdateParams) {
    const { noteId } = params;
    const node = YjsUtils.getNodeFromDoc(params.ydoc);

    const firstHeading = ProseUtils.getFirstHeadingContent(node);

    await BacklinkService.recreateForNote({
      node,
      noteId,
    });
    await TagService.recreateForNote({
      node,
      noteId,
    });

    // incrament vector clock
    const note = await get({ id: noteId });
    const clientId = getClientId();
    const prevClock = note.vector_clock[clientId] ?? 0;
    const newVectorClock: VectorClock = {
      ...params.vector_clock,
    };

    if (params.shouldIncrementVectorClock) {
      newVectorClock[clientId] = prevClock + 1;
    }

    // note
    const noteUpdated = await db
      .updateTable("notes")
      .where("id", "=", noteId)
      .set({
        content: Y.encodeStateAsUpdate(params.ydoc), // The actual content
        title: firstHeading ?? "Untitled",
        vector_clock: JSON.stringify(newVectorClock),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return noteUpdated;
  }

  type ListInMonthRecord = {
    day: string;
    note: Record;
  };

  export async function listInMonth(
    monthStartISO: string,
  ): Promise<ListInMonthRecord[]> {
    const monthStart = new Date(monthStartISO);
    const monthEnd = endOfMonth(monthStartISO);
    const monthEndISO = formatISO(monthEnd, {
      representation: "date",
    });

    const notesExisting = await listDaily({
      rangeStart: monthStartISO,
      rangeEnd: monthEndISO,
    });

    const dates = eachDayOfInterval({
      start: monthStart,
      end: monthEnd,
    });

    // Find out what notes are missing
    const missingDays = dates
      .filter((date) => {
        const day = formatISO(date, { representation: "date" });

        return !notesExisting.find((note) => note.daily_at === day);
      })
      .map((date) => formatISO(date, { representation: "date" }));

    const notesCreated = await createMissingDays(missingDays);

    const allNotes = [...notesExisting, ...notesCreated];

    return dates.map((date) => {
      const day = formatISO(date, { representation: "date" });

      const note = allNotes.find((note) => note.daily_at === day);

      // At this point notes for each day should exist
      if (!note) {
        throw new Error(`Note not found for ${day}`);
      }

      return {
        day,
        note,
      };
    });
  }

  async function createMissingDays(days: string[]): Promise<Record[]> {
    if (!days.length) {
      return [];
    }

    const notesToInsert: Insertable<NotesTable>[] = days.map((day) => {
      const emptyNoteJson = getEmptyNoteJSON(day);
      const ydoc = YjsUtils.prosemirrorJSONToYDoc(emptyNoteJson);
      const clientId = getClientId();

      return {
        id: nanoid(),
        daily_at: day,
        title: day,
        content: Y.encodeStateAsUpdate(ydoc),
        vector_clock: JSON.stringify({
          [clientId]: 0,
        }),
      };
    });

    const notesInserted = await db
      .insertInto("notes")
      .values(notesToInsert)
      .returningAll()
      .execute();

    return notesInserted;
  }

  type ListDailyParams = {
    rangeStart: string;
    rangeEnd: string;
  };

  async function listDaily(params: ListDailyParams): Promise<Record[]> {
    const { rangeStart, rangeEnd } = params;

    const notes = await db
      .selectFrom("notes")
      .orderBy("notes.title", "asc")
      .selectAll("notes")
      .where((eb) => {
        return eb.and([
          eb("daily_at", ">=", rangeStart),
          eb("daily_at", "<=", rangeEnd),
        ]);
      })
      .execute();

    return notes;
  }

  function getEmptyNoteJSON(title: string): JSONContent {
    return {
      type: "doc",
      content: [
        {
          type: "heading",
          attrs: {
            level: 1,
          },
          content: [
            {
              type: "text",
              text: title,
            },
          ],
        },
        {
          type: "paragraph",
        },
      ],
    };
  }

  type RemoteNote = RouterOutput["note"]["getSyncPlan"]["notesToDownload"][0];
  type RemoteNoteInput = RouterInput["note"]["save"]["notes"][0];

  export async function sync() {
    const localMetadata = await db
      .selectFrom("notes")
      .select(["notes.id", "notes.vector_clock as vectorClock"])
      .execute();

    const remoteNotes = await trpcClient.note.getSyncPlan.mutate({
      localMetadata,
    });
    const remoteVectorClocks = new Map(
      remoteNotes.notesToDownload.map((note) => [note.id, note.vectorClock]),
    );

    const mergedNotes = [];
    const createdNotes = [];

    for (const remoteNote of remoteNotes.notesToDownload) {
      const localNote = await find({ id: remoteNote.id });

      if (!localNote) {
        const createdNote = await createLocalNoteFromRemote(remoteNote);
        createdNotes.push(createdNote);
        continue;
      }

      const mergedNote = await mergeLocalNoteWithRemote(localNote, remoteNote);
      mergedNotes.push(mergedNote);
    }

    const notesToUpload: RemoteNoteInput[] = [];

    for (const noteToUploadId of remoteNotes.notesToUpload) {
      const localNote = await find({ id: noteToUploadId });

      if (!localNote) {
        continue;
      }

      const oldVectorClock = remoteVectorClocks.get(noteToUploadId);
      const ydoc = YjsUtils.createDocFromUpdate(localNote.content);
      const sv = Y.encodeStateVector(ydoc);

      notesToUpload.push({
        content: Array.from(localNote.content),
        id: localNote.id,
        sv: Array.from(sv),
        daily_at: localNote.daily_at,
        newVectorClock: localNote.vector_clock,
        oldVectorClock: oldVectorClock ?? localNote.vector_clock,
      });
    }

    console.log(remoteNotes, notesToUpload);

    if (notesToUpload.length > 0) {
      await trpcClient.note.save.mutate({
        notes: notesToUpload,
        clientId: getClientId(),
      });
    }

    toast(
      JSON.stringify({
        toDownload: remoteNotes.notesToDownload.length,
        toUpload: notesToUpload.length,
        merged: mergedNotes.length,
        created: createdNotes.length,
      }),
    );
  }

  export async function mergeLocalNoteWithRemote(
    localNote: Selectable<NotesTable>,
    remoteNote: RemoteNote,
  ) {
    const { mergedYDoc, equalSnaphosts } = YjsUtils.mergeDocs({
      localContent: localNote.content,
      remoteContent: new Uint8Array(remoteNote.content),
    });

    return await update({
      noteId: localNote.id,
      ydoc: mergedYDoc,
      vector_clock: remoteNote.vectorClock,
      shouldIncrementVectorClock: !equalSnaphosts,
    });
  }

  export async function createLocalNoteFromRemote(remoteNote: RemoteNote) {
    const content = new Uint8Array(remoteNote.content);
    const remoteDoc = YjsUtils.createDocFromUpdate(content);

    const node = YjsUtils.getNodeFromDoc(remoteDoc);
    const firstHeading = ProseUtils.getFirstHeadingContent(node);

    await BacklinkService.recreateForNote({
      node,
      noteId: remoteNote.id,
    });
    await TagService.recreateForNote({
      node,
      noteId: remoteNote.id,
    });

    const note = await db
      .insertInto("notes")
      .values({
        id: remoteNote.id,
        title: firstHeading ?? "Untitled",
        content: content,
        daily_at: remoteNote.dailyAt,
        vector_clock: JSON.stringify(remoteNote.vectorClock),
      })
      .returningAll()
      .executeTakeFirstOrThrow();

    return note;
  }

  export async function syncSingle(remoteNote: NoteUpdateDownstreamMessage) {
    const mergedNotes = [];
    const createdNotes = [];

    const localNote = await find({ id: remoteNote.id });
    let note;

    if (!localNote) {
      note = await createLocalNoteFromRemote(remoteNote);
      createdNotes.push(note);
    } else {
      note = await mergeLocalNoteWithRemote(localNote, remoteNote);
      mergedNotes.push(note);
    }

    const notesToUpload: RemoteNoteInput[] = [];

    const oldVectorClock = remoteNote.vectorClock;

    if (!vectorClocksEqual(oldVectorClock, note.vector_clock)) {
      const ydoc = YjsUtils.createDocFromUpdate(note.content);
      const sv = Y.encodeStateVector(ydoc);

      notesToUpload.push({
        content: Array.from(note.content),
        id: note.id,
        sv: Array.from(sv),
        daily_at: note.daily_at,
        newVectorClock: note.vector_clock,
        oldVectorClock: note.vector_clock,
      });
    }

    if (notesToUpload.length > 0) {
      await trpcClient.note.save.mutate({
        notes: notesToUpload,
        clientId: getClientId(),
      });
    }

    toast(
      JSON.stringify({
        toUpload: notesToUpload.length,
        merged: mergedNotes.length,
        created: createdNotes.length,
      }),
    );
  }

  export async function find({ id }: { id: string }) {
    const note = await db
      .selectFrom("notes")
      .selectAll("notes")
      .where((eb) => {
        return eb.and([eb("notes.id", "=", id)]);
      })
      .executeTakeFirst();
    return note;
  }

  export async function get({ id }: { id: string }) {
    const note = await db
      .selectFrom("notes")
      .selectAll("notes")
      .where((eb) => {
        return eb.and([eb("notes.id", "=", id)]);
      })
      .executeTakeFirstOrThrow();
    return note;
  }

  export function formatDailyNoteTitle(date: string) {
    return format(date, "EEE, MMMM do, yyyy");
  }
}

function vectorClocksEqual(a: VectorClock, b: VectorClock) {
  // Check if they have the same keys
  const aKeys = Object.keys(a).sort();
  const bKeys = Object.keys(b).sort();

  if (aKeys.length !== bKeys.length) {
    return false;
  }

  for (let i = 0; i < aKeys.length; i++) {
    if (aKeys[i] !== bKeys[i]) {
      return false;
    }
  }

  // Check if all values match
  for (const key of aKeys) {
    if (a[key] !== b[key]) {
      return false;
    }
  }

  return true;
}
