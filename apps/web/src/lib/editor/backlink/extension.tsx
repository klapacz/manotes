import { Data, Stream, Option } from "effect";
import { defineClipboardSerializer, definePlugin, union } from "prosekit/core";
import type { ProseMirrorNode } from "prosekit/pm/model";
import { Plugin } from "prosekit/pm/state";
import {
  defineSolidNodeView,
  type SolidNodeViewComponent,
  type SolidNodeViewProps,
} from "../prosekit-solid";
import { createEffect, createMemo } from "solid-js";
import type { JSX } from "@solidjs/web";
import * as NoteCache from "../../note-cache.service";
import { runStream } from "../../solid-effect";
import { decodeBacklinkAttrs, type BacklinkAttrs } from "./spec";
import { NoteFormat } from "../../note";
import { NoteLink } from "../../note/link-component";

export type { BacklinkAttrs };

// ---------------------------------------------------------------------------
// Node View
// ---------------------------------------------------------------------------

type BacklinkLabelEntry = Data.TaggedEnum<{
  Loading: {};
  Missing: {};
  Resolved: { title: string };
}>;

const BacklinkLabelEntry = Data.taggedEnum<BacklinkLabelEntry>();

function createBacklinkView(labelSnapshot: Map<string, string>) {
  return function BacklinkView(props: SolidNodeViewProps): JSX.Element {
    const attrs = createMemo(() => decodeBacklinkAttrs(props.node.attrs));
    const noteId = () => attrs().id;

    const state = createMemo(
      () =>
        runStream(
          NoteCache.Service.use((cache) => cache.changes(noteId())).pipe(
            Stream.unwrap,
            Stream.map(
              Option.match({
                onSome: (note): BacklinkLabelEntry =>
                  BacklinkLabelEntry.Resolved({ title: NoteFormat.label(note) }),
                onNone: BacklinkLabelEntry.Missing,
              }),
            ),
          ),
        ),
      { loadingValue: BacklinkLabelEntry.Loading() },
    );

    createEffect(
      () => ({ id: noteId(), entry: state() }),
      ({ id, entry }) => {
        BacklinkLabelEntry.$match(entry, {
          Loading: () => labelSnapshot.delete(id),
          Resolved: ({ title }) => labelSnapshot.set(id, title),
          Missing: () => labelSnapshot.delete(id),
        });
      },
    );

    const label = BacklinkLabelEntry.$match({
      Resolved: ({ title }) => title,
      Missing: () => "[unavailable note]",
      Loading: () => "",
    });

    return (
      <NoteLink
        id={noteId()}
        data-backlink=""
        data-backlink-state={state()._tag}
        data-backlink-id={noteId()}
        contenteditable="false"
      >
        {label(state())}
      </NoteLink>
    );
  } satisfies SolidNodeViewComponent;
}

// ---------------------------------------------------------------------------
// Clipboard Serialization
// ---------------------------------------------------------------------------

function clipboardLeafText(
  node: ProseMirrorNode,
  labelSnapshot: ReadonlyMap<string, string>,
): string {
  if (node.type.name === "backlink") {
    const { id } = decodeBacklinkAttrs(node.attrs);

    return labelSnapshot.get(id) ?? id;
  }

  return node.type.spec.leafText?.(node) ?? "";
}

// ---------------------------------------------------------------------------
// Runtime Extension (node view + clipboard – requires browser/Solid)
// ---------------------------------------------------------------------------

export function defineBacklinkRuntime() {
  const labelSnapshot = new Map<string, string>();
  const BacklinkView = createBacklinkView(labelSnapshot);

  return union(
    defineClipboardSerializer({
      nodesFromSchemaWrapper: (nodesFromSchema) => (schema) => {
        const nodes = nodesFromSchema(schema);

        return {
          ...nodes,
          backlink: (node) => {
            const { id } = decodeBacklinkAttrs(node.attrs);

            return [
              "span",
              {
                "data-backlink": "",
                "data-backlink-id": id,
              },
              labelSnapshot.get(id) ?? id,
            ];
          },
        };
      },
    }),
    definePlugin(
      () =>
        new Plugin({
          props: {
            clipboardTextSerializer(slice) {
              return slice.content.textBetween(0, slice.content.size, "\n\n", (node) =>
                clipboardLeafText(node, labelSnapshot),
              );
            },
          },
        }),
    ),
    defineSolidNodeView({
      name: "backlink",
      component: BacklinkView,
    }),
  );
}
