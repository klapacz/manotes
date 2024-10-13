import { ProseUtils } from "@/lib/prose.utils";
import { db } from "@/sqlocal/client";
import type { NotesTable } from "@/sqlocal/schema";
import type { EditorEvents, JSONContent } from "@tiptap/core";
import { formatISO, endOfMonth, eachDayOfInterval } from "date-fns";
import type { Insertable, Selectable } from "kysely";
import { nanoid } from "nanoid";

export namespace NoteService {
  type Record = Selectable<NotesTable>;

  export type UpdateParams = {
    editor: EditorEvents["update"]["editor"];
    noteId: string;
  };

  export async function update(params: UpdateParams) {
    const { editor, noteId } = params;

    const json = editor.getJSON();
    const firstHeading = ProseUtils.getFirstHeadingContent(editor.$doc.node);

    const backlinks = ProseUtils.findAllBacklinks(editor.$doc.node);

    // backlinks
    await db.deleteFrom("backlinks").where("source_id", "=", noteId).execute();

    if (backlinks.length) {
      await db
        .insertInto("backlinks")
        .values(
          backlinks.map((backlink) => ({
            source_id: noteId,
            target_id: backlink,
          })),
        )
        .execute();
    }

    // tags
    const tags = ProseUtils.findAllTags(editor.$doc.node);

    await db.deleteFrom("notes_tags").where("note_id", "=", noteId).execute();

    if (tags.length) {
      await db
        .insertInto("notes_tags")
        .values(
          tags.map((tag) => ({
            note_id: noteId,
            tag_id: tag,
          })),
        )
        .execute();
    }

    // note
    await db
      .updateTable("notes")
      .where("id", "=", noteId)
      .set({
        content: JSON.stringify(json),
        title: firstHeading ?? "Untitled",
      })
      .execute();
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

    const notesToInsert: Insertable<NotesTable>[] = days.map((day) => ({
      id: nanoid(),
      daily_at: day,
      title: day,
      content: JSON.stringify(getEmptyNoteJSON(day)),
    }));

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
}
