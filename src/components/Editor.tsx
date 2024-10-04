import "remirror/styles/all.css";
import "prosemirror-flat-list/style.css";

import React, { useCallback, useRef, useState } from "react";
import { ExtensionPriority } from "remirror";
import {
  BlockquoteExtension,
  BoldExtension,
  CodeExtension,
  DocExtension,
  HardBreakExtension,
  HeadingExtension,
  ItalicExtension,
  LinkExtension,
  MarkdownExtension,
  StrikeExtension,
  TrailingNodeExtension,
} from "remirror/extensions";
import {
  EditorComponent,
  Remirror,
  ThemeProvider,
  useDocChanged,
  useHelpers,
  useRemirror,
} from "@remirror/react";
import { TabVoidExtension } from "@/lib/remirror/tab-void-extension";
import { useQuery } from "@tanstack/react-query";
import { db } from "@/sqlocal/client";
import { Node } from "@remirror/pm/model";
import { ListExtension } from "@/lib/remirror/list-extensions";

export function Editor(props: { noteId: number }) {
  const query = useQuery({
    queryKey: ["note", props.noteId],
    queryFn: async () => {
      return await db
        .selectFrom("notes")
        .where("notes.id", "=", props.noteId)
        .select(["notes.content"])
        .executeTakeFirstOrThrow();
    },
    staleTime: 0,
    gcTime: 0,
    refetchOnMount: "always",
    refetchOnReconnect: false,
    refetchOnWindowFocus: false,
  });

  if (!query.isSuccess) {
    return null;
  }

  return <EditorInner content={query.data.content} noteId={props.noteId} />;
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

        new ListExtension(),

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

    return (
      <Remirror manager={manager} initialContent={props.initialContent}>
        <EditorComponent />
        <OnDocChanged noteId={props.noteId} />
      </Remirror>
    );
  }
);

EditorContent.displayName = "EditorContent";

function OnDocChanged({ noteId }: { noteId: number }) {
  const { getJSON } = useHelpers();

  // TODO: race condition
  // TODO: debaunce
  useDocChanged(
    useCallback(
      async (props) => {
        const json = getJSON(props.state);
        const firstHeading = getFirstHeadingContent(props.state.doc);

        await db
          .updateTable("notes")
          .where("id", "=", noteId)
          .set({
            content: JSON.stringify(json),
            title: firstHeading ?? "Untitled",
          })
          .execute();

        const end = performance.now();
      },
      [getJSON, noteId]
    )
  );

  return null;
}

function getFirstHeadingContent(doc: Node): string | null {
  let headingContent: string | null = null;

  doc.descendants((node, pos) => {
    if (node.type.name === "heading") {
      headingContent = node.textContent;
      return false; // Stop traversing
    }
  });

  return headingContent;
}
