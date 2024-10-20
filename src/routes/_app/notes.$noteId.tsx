import { Editor } from "@/components/Editor";
import { db } from "@/sqlocal/client";
import { createFileRoute, Link } from "@tanstack/react-router";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import { jsonArrayFrom } from "kysely/helpers/sqlite";
import type { NoteService } from "@/services/note.service";
import { Tag } from "@/lib/tiptap/tags/tag";
import LinkExtension from "@tiptap/extension-link";
import { FlatListNode } from "@/lib/tiptap/flat-list-extension";
import { Backlink } from "@/lib/tiptap/backlink/backlink";

import React from "react";
import { BacklinkContext } from "@/lib/pm/backlinks-context";
import { HeadingExtension } from "@/lib/tiptap/heading/heading";
import { LinkNote } from "@/components/link-note";

export const Route = createFileRoute("/_app/notes/$noteId")({
  component: NotePage,
  loader: async ({ params }) => {
    // TODO: use repo
    const note = await db
      .selectFrom("notes")
      .where("notes.id", "=", params.noteId)
      .selectAll("notes")
      .select((eb) => [
        jsonArrayFrom(
          eb
            .selectFrom("backlinks")
            .where("backlinks.target_id", "=", eb.ref("notes.id"))
            .innerJoin(
              "notes as source_notes",
              "source_notes.id",
              "backlinks.source_id",
            )
            .select([
              "source_notes.id",
              "source_notes.title",
              "source_notes.daily_at",
              "source_notes.content",
            ]),
        ).as("backlinks"),
      ])
      .executeTakeFirstOrThrow();

    return note;
  },
  staleTime: 0,
});

function NotePage() {
  const note = Route.useLoaderData();

  return (
    <div>
      <Editor
        note={note}
        className="p-8"
        // The editor should rerender when the note changes
        key={note.id}
      />

      <div className="p-8">
        <h1 className="text-sm font-medium text-muted-foreground pb-2">
          Backlinks
        </h1>
        <div
          className="divide-y"
          // Rerender the backlinks when the note changes
          key={note.id}
        >
          {note.backlinks.map((backlink) => (
            <BacklinkEditor
              key={backlink.id}
              backlink={backlink}
              targetNoteId={note.id}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function BacklinkEditor({
  backlink,
  targetNoteId,
}: {
  backlink: NoteService.Record;
  targetNoteId: string;
}) {
  const editor = useEditor({
    extensions: [
      // TODO: the doc extension is not needed, I should create an abstraction over the editor
      StarterKit.configure({
        listItem: false,
        bulletList: false,
        orderedList: false,
        heading: false,
      }),
      HeadingExtension,
      Tag,
      LinkExtension,
      FlatListNode,
      Backlink,
    ],
    content: "",
    editable: false,
  });

  React.useEffect(() => {
    if (editor) {
      const doc = editor.schema.nodeFromJSON(backlink.content);
      const backlinkInfo = BacklinkContext.findBacklinkNode(doc, targetNoteId);
      if (backlinkInfo) {
        const context = BacklinkContext.extractBacklinkContext(
          doc,
          backlinkInfo,
        );
        editor.commands.setContent(context.toJSON());
      } else {
        editor.commands.setContent(backlink.content);
      }
    }
  }, [editor, backlink.content, targetNoteId]);

  if (!editor) {
    return null;
  }

  return (
    <div className="py-4">
      <LinkNote className="block pb-2 text-blue-600" note={backlink} />
      <EditorContent editor={editor} className="tiptap-editor" />
    </div>
  );
}
