import { useQuery } from "@tanstack/react-query";
import { db } from "@/sqlocal/client";
import { useEditor, EditorContent } from "@tiptap/react";
import { Node, type JSONContent } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { FlatListNode } from "@/lib/tiptap/flat-list-extension";
import { Link } from "@tiptap/extension-link";
import { Backlink } from "@/lib/tiptap/backlink/backlink";
import { Tag } from "@/lib/tiptap/tags/tag";
import { cn } from "@/lib/utils";
import { NoteService } from "@/services/note.service";

type EditorProps = {
  noteId: string;
  className?: string;
};

export function Editor(props: EditorProps) {
  const query = useQuery({
    queryKey: ["note", props.noteId],
    queryFn: async () => {
      return await db
        .selectFrom("notes")
        .where("notes.id", "=", props.noteId)
        .select(["notes.content", "id"])
        .executeTakeFirstOrThrow();
    },
    // Refetch only on mount, and do not cache the result
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  if (!query.isSuccess) {
    return null;
  }
  return (
    <EditorInner
      content={query.data.content}
      noteId={query.data.id}
      className={props.className}
    />
  );
}

const Document = Node.create({
  name: "doc",
  topNode: true,
  // The document must always have a heading
  content: "heading block+",
});

type EditorInnerProps = {
  content: JSONContent;
  noteId: string;
  className?: string;
};

function EditorInner(props: EditorInnerProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        listItem: false,
        bulletList: false,
        orderedList: false,
        document: false,
      }),
      Backlink,
      Tag,
      Link,
      FlatListNode,
      Document,
    ],
    content: props.content,
    editorProps: {
      attributes: {
        class: cn(
          "tiptap-editor p-10 focus:outline-none focus:border-slate-400",
          props.className
        ),
      },
    },
    async onUpdate({ editor }) {
      NoteService.update({ editor, noteId: props.noteId });
    },
  });

  return <EditorContent editor={editor} />;
}
