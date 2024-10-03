import "remirror/styles/all.css";

import React, { useCallback, useState } from "react";
import { ExtensionPriority, type RemirrorJSON } from "remirror";
import {
  BlockquoteExtension,
  BoldExtension,
  BulletListExtension,
  CodeExtension,
  DocExtension,
  HardBreakExtension,
  HeadingExtension,
  ItalicExtension,
  LinkExtension,
  ListItemExtension,
  MarkdownExtension,
  OrderedListExtension,
  StrikeExtension,
  TaskListExtension,
  TrailingNodeExtension,
} from "remirror/extensions";
import {
  EditorComponent,
  OnChangeJSON,
  Remirror,
  ThemeProvider,
  useRemirror,
} from "@remirror/react";
import { ToggleTodoItemExtension } from "@/lib/remirror/toggle-todo-item-extension";
import { TabVoidExtension } from "@/lib/remirror/tab-void-extension";
import { useQuery, useSuspenseQuery } from "@tanstack/react-query";
import { db } from "@/sqlocal/client";

export function Editor(props: { noteId: number }) {
  const { data: note, isSuccess } = useQuery({
    queryKey: ["note", props.noteId],
    queryFn: async () => {
      return await db
        .selectFrom("notes")
        .where("notes.id", "=", props.noteId)
        .select(["notes.content"])
        .executeTakeFirstOrThrow();
    },
    staleTime: Infinity,
  });

  if (!isSuccess) {
    return <div></div>;
  }

  return <EditorInner content={note.content} noteId={props.noteId} />;
}

/**
 * The editor which is used to create the annotation. Supports formatting.
 */
function EditorInner(props: { content: any; noteId: number }) {
  return (
    <ThemeProvider>
      <EditorContent initialContent={props.content} noteId={props.noteId} />
    </ThemeProvider>
  );
}

const EditorContent = React.memo<{ initialContent: string; noteId: number }>(
  (props) => {
    const extensions = useCallback(
      () => [
        new DocExtension({
          content: "heading block+",
        }),
        new LinkExtension({ autoLink: true }),
        // new PlaceholderExtension({ placeholder }),
        new BoldExtension({}),
        new StrikeExtension(),
        new ItalicExtension(),
        new HeadingExtension({}),
        new BlockquoteExtension(),

        new BulletListExtension({ enableSpine: true }),
        new OrderedListExtension(),
        new ListItemExtension({
          priority: ExtensionPriority.High,
          enableCollapsible: true,
        }),
        new TaskListExtension(),
        new ToggleTodoItemExtension(),

        new CodeExtension(),
        new TrailingNodeExtension({}),
        new MarkdownExtension({ copyAsMarkdown: false }),
        /**
         * `HardBreakExtension` allows us to create a newline inside paragraphs.
         * e.g. in a list item
         */
        new HardBreakExtension(),
        new TabVoidExtension({
          priority: ExtensionPriority.Lowest,
        }),
      ],
      []
    );

    const { manager } = useRemirror({
      extensions,
      stringHandler: "markdown",
    });

    // TODO: race condition
    // TODO: debaunce
    // TODO: extract note title from RemirrorJSON
    async function onChange(json: RemirrorJSON) {
      await db
        .updateTable("notes")
        .where("id", "=", props.noteId)
        .set({
          content: JSON.stringify(json),
        })
        .execute();
    }

    return (
      <Remirror manager={manager} initialContent={props.initialContent}>
        <EditorComponent />
        <OnChangeJSON onChange={onChange} />
      </Remirror>
    );
  }
);

EditorContent.displayName = "EditorContent";
