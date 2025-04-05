import { Editor } from "@/components/editor";
import { db } from "@/sqlocal/client";
import { createFileRoute } from "@tanstack/react-router";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";

import type { NoteService } from "@/services/note.service";
import { Tag } from "@/lib/tiptap/tags/tag";
import LinkExtension from "@tiptap/extension-link";
import { FlatListNode } from "@/lib/tiptap/flat-list-extension";
import { Backlink } from "@/lib/tiptap/backlink/backlink";

import React from "react";
import { BacklinkContext } from "@/lib/pm/backlinks-context";
import { HeadingExtension } from "@/lib/tiptap/heading/heading";
import { LinkNote } from "@/components/link-note";
import { YjsUtils } from "@/lib/yjs.utils";
import * as Y from "yjs";
import { yXmlFragmentToProseMirrorRootNode } from "y-prosemirror";

export const Route = createFileRoute("/_app/notes/$noteId")({
  component: NotePage,
  loader: async ({ params }) => {
    // TODO: use repo
    const [note, backlinks] = await Promise.all([
      db
        .selectFrom("notes")
        .where("notes.id", "=", params.noteId)
        .selectAll("notes")
        .selectAll("notes")
        .executeTakeFirstOrThrow(),
      db
        .selectFrom("backlinks")
        .where("backlinks.target_id", "=", params.noteId)
        .innerJoin(
          "notes as source_notes",
          "source_notes.id",
          "backlinks.source_id",
        )
        .orderBy("source_notes.daily_at", "desc")
        .selectAll("source_notes")
        .execute(),
    ]);

    return { note, backlinks };
  },

  // Set staleTime to 0 to consider data stale immediately after loading
  staleTime: 0,
  // Set gcTime to 0 to remove data from cache as soon as it's not actively used
  gcTime: 0,
  // Force reload on every navigation to this route
  shouldReload: () => true,
});

function NotePage() {
  const { note, backlinks } = Route.useLoaderData();

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
          {backlinks.map((backlink) => (
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
    // TODO: move to a function
    if (!editor) {
      return;
    }

    const ydoc = YjsUtils.createDocFromUpdate(backlink.content);
    const yXmlFragment = ydoc.get("prosemirror", Y.XmlFragment);
    const doc = yXmlFragmentToProseMirrorRootNode(yXmlFragment, editor.schema);

    const backlinkInfos = BacklinkContext.findBacklinkNodes(doc, targetNoteId);

    if (backlinkInfos.length === 0) {
      console.error(`No incoming backlinks found in note ${backlink.id}`);
      editor.commands.setContent(backlink.content);
      return;
    }

    const contextNodes = backlinkInfos.map((backlinkInfo) =>
      BacklinkContext.extractBacklinkContext(doc, backlinkInfo),
    );

    const uncollapsedNodes = contextNodes.map((node) =>
      BacklinkContext.uncollapseLists(node),
    );

    try {
      const newDoc = editor.schema.node("doc", {}, uncollapsedNodes);
      editor.commands.setContent(newDoc.toJSON());
    } catch (error) {
      debugger;
      throw error;
    }
  }, [editor, backlink.content, targetNoteId]);

  if (!editor) {
    return null;
  }

  return (
    <div className="py-4">
      <LinkNote className="block pb-4 text-link-foreground" note={backlink} />
      <EditorContent editor={editor} className="tiptap-editor" />
    </div>
  );
}
