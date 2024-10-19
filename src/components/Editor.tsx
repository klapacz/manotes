import { useEditor, EditorContent } from "@tiptap/react";
import { Editor as TiptapEditor, Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { FlatListNode } from "@/lib/tiptap/flat-list-extension";
import { Link } from "@tiptap/extension-link";
import { Backlink } from "@/lib/tiptap/backlink/backlink";
import { Tag } from "@/lib/tiptap/tags/tag";
import { cn } from "@/lib/utils";
import { NoteService } from "@/services/note.service";
import type { NotesTable } from "@/sqlocal/schema";
import type { Selectable } from "kysely";
import { useLocation, useNavigate } from "@tanstack/react-router";
import { Heading } from "@tiptap/extension-heading";
import React, { useCallback, useEffect } from "react";

import { format, parse } from "date-fns";
import { Button } from "./ui/button";
import { ClipboardCopyIcon } from "lucide-react";
import { toast } from "sonner";

type EditorProps = {
  note: NoteService.Record;
  className?: string;
};

export function Editor(props: EditorProps) {
  return <EditorInner note={props.note} className={props.className} />;
}

const Document = Node.create({
  name: "doc",
  topNode: true,
  // The document must always have a heading
  content: "heading block+",
});

type EditorInnerProps = {
  note: NoteService.Record;
  className?: string;
};

// TODO: move to @/lib/tiptap
const CustomHeading = Heading.extend({
  renderHTML({ node, HTMLAttributes }) {
    const hasLevel = this.options.levels.includes(node.attrs.level);
    const level = hasLevel ? node.attrs.level : this.options.levels[0];

    let text = node.textContent;
    let content: string | number = 0;

    if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
      const date = parse(text, "yyyy-MM-dd", new Date());
      content = format(date, "EEE, MMMM do, yyyy");
    }

    return [
      `h${level}`,
      mergeAttributes(this.options.HTMLAttributes, HTMLAttributes),
      content,
    ];
  },
});

function EditorInner(props: EditorInnerProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        listItem: false,
        bulletList: false,
        orderedList: false,
        document: false,
        heading: false,
      }),
      CustomHeading,
      Tag,
      Link,
      FlatListNode,
      Backlink,
      Document,
    ],
    content: props.note.content,
    editorProps: {
      attributes: {
        class: cn(
          "tiptap-editor p-10 focus:outline-none focus:border-slate-400",
          props.className,
        ),
      },
    },
    async onUpdate({ editor }) {
      NoteService.update({ editor, noteId: props.note.id });
    },
  });

  // On notes.$noteId route, when the note id change we need to manually set the content
  useEffect(() => {
    editor?.commands.setContent(props.note.content);
  }, [props.note.content]);

  useEditorFocus(editor, props.note);

  return (
    <div className="relative group">
      <EditorContent editor={editor} />
      <CopyButton
        editor={editor}
        className="opacity-0 group-hover:opacity-100 transition-all"
      />
    </div>
  );
}

type CopyButtonProps = React.ComponentProps<typeof Button> & {
  editor: TiptapEditor | null;
};

function CopyButton({ editor, className, ...props }: CopyButtonProps) {
  const handleCopy = () => {
    if (editor) {
      const content = JSON.stringify(editor.getJSON());
      navigator.clipboard
        .writeText(content)
        .then(() => {
          toast("Content copied to clipboard!");
        })
        .catch((err) => {
          console.error(err);
          toast.error("Failed to copy");
        });
    }
  };

  return (
    <Button
      onClick={handleCopy}
      size="icon"
      className={cn("absolute top-2 right-2", className)}
      variant="outline"
      {...props}
    >
      <ClipboardCopyIcon />
    </Button>
  );
}

/**
 * Hook to manage editor focus behavior and scrolling
 * @param editor The Tiptap editor instance
 * @param note The note object being edited
 */
function useEditorFocus(
  editor: TiptapEditor | null,
  note: Selectable<NotesTable>,
) {
  const navigate = useNavigate();
  const currentDate = useLocation({
    select: ({ search }) => search.date,
  });

  // Flag to track if date change was triggered by editor focus
  const dateChangeByFocus = React.useRef(false);

  useEffect(() => {
    // If the editor exists, the note has a daily date, and it matches the current date
    if (editor && note.daily_at && currentDate === note.daily_at) {
      // Focus the editor at the end without scrolling
      editor.commands.focus("end", { scrollIntoView: false });
      const editorElement = editor.view.dom;
      // If the editor element exists and the date change wasn't by focus, scroll it into view
      if (editorElement && !dateChangeByFocus.current) {
        editorElement.scrollIntoView({ block: "start" });
      }
      // Reset the flag after handling
      dateChangeByFocus.current = false;
    }
  }, [currentDate, editor, note.daily_at]);

  // Handler for editor focus event
  const handleFocus = useCallback(() => {
    // If the note has a daily date and it's different from the current date
    if (note.daily_at && currentDate !== note.daily_at) {
      // Navigate to the note's date
      navigate({
        to: "/",
        search: {
          date: note.daily_at,
        },
      });
      // Set the flag to indicate date change was triggered by focus
      dateChangeByFocus.current = true;
    }
  }, [currentDate, note.daily_at]);

  useEffect(() => {
    // If editor exists, add the focus event listener
    if (editor) {
      editor.on("focus", handleFocus);
      // Cleanup function to remove the event listener
      return () => {
        editor.off("focus", handleFocus);
      };
    }
  }, [editor, handleFocus]);
}
