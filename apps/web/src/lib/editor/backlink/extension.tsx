import { Data, Stream, Option } from "effect";
import { defineClipboardSerializer, definePlugin, union } from "prosekit/core";
import type { ProseMirrorNode } from "prosekit/pm/model";
import { Plugin } from "prosekit/pm/state";
import {
  defineSolidNodeView,
  type SolidNodeViewComponent,
  type SolidNodeViewProps,
} from "prosekit/solid";
import { createEffect, createMemo, type JSX } from "solid-js";
import * as NoteCache from "../../note-cache.service";
import { bindRt, createAtomStore, createSyncedAtom } from "../..";
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
    const noteIdAtom = createSyncedAtom(noteId);

    const state = createAtomStore(
      bindRt((rt) =>
        rt.atom((get) => {
          const noteId = get(noteIdAtom);

          return NoteCache.Service.use((cache) => cache.changes(noteId)).pipe(
            Stream.unwrap,
            Stream.map(
              Option.match({
                onSome: (note): BacklinkLabelEntry =>
                  BacklinkLabelEntry.Resolved({ title: NoteFormat.label(note) }),
                onNone: BacklinkLabelEntry.Missing,
              }),
            ),
          );
        }),
      ),
      BacklinkLabelEntry.Loading(),
    );

    createEffect(() => {
      BacklinkLabelEntry.$match({
        Loading: () => labelSnapshot.delete(noteId()),
        Resolved: ({ title }) => labelSnapshot.set(noteId(), title),
        Missing: () => labelSnapshot.delete(noteId()),
      })(state.value);
    });

    const label = BacklinkLabelEntry.$match({
      Resolved: ({ title }) => title,
      Missing: () => "[unavailable note]",
      Loading: () => "",
    });

    return (
      <NoteLink
        id={noteId()}
        data-backlink=""
        data-backlink-state={state.value._tag}
        data-backlink-id={noteId()}
        contentEditable={false}
      >
        {label(state.value)}
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
