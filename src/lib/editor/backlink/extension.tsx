import { Data, Effect, Stream, Option } from "effect";
import { defineClipboardSerializer, definePlugin, union } from "prosekit/core";
import type { ProseMirrorNode } from "prosekit/pm/model";
import { Plugin } from "prosekit/pm/state";
import {
  defineSolidNodeView,
  type SolidNodeViewComponent,
  type SolidNodeViewProps,
} from "prosekit/solid";
import { createEffect, type JSX } from "solid-js";
import * as NoteCache from "../../note-cache.service";
import { createRuntimeStreamStore } from "../../runtime.primitives";
import { Link } from "@tanstack/solid-router";
import { type BacklinkAttrs } from "./spec";

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
    const noteId = () => (props.node.attrs as BacklinkAttrs).id;
    const state: BacklinkLabelEntry = createRuntimeStreamStore(
      () =>
        NoteCache.Service.pipe(
          Effect.flatMap((cache) => cache.changes(noteId())),
          Stream.unwrapScoped,
          Stream.map(
            Option.match({
              onSome: ({ title }): BacklinkLabelEntry =>
                BacklinkLabelEntry.Resolved({ title }),
              onNone: BacklinkLabelEntry.Missing,
            }),
          ),
        ),
      BacklinkLabelEntry.Loading(),
    );

    createEffect(() => {
      BacklinkLabelEntry.$match({
        Loading: () => labelSnapshot.delete(noteId()),
        Resolved: ({ title }) => labelSnapshot.set(noteId(), title),
        Missing: () => labelSnapshot.delete(noteId()),
      })(state);
    });

    const label = BacklinkLabelEntry.$match({
      Resolved: ({ title }) => title,
      Missing: () => "[unavailable note]",
      Loading: () => "",
    });

    return (
      <Link
        to="/$graph/note/$note"
        from="/$graph"
        params={{ note: noteId() }}
        data-backlink=""
        data-backlink-state={state._tag}
        data-backlink-id={noteId()}
        contentEditable={false}
      >
        {label(state)}
      </Link>
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
    return (
      labelSnapshot.get((node.attrs as BacklinkAttrs).id) ??
      (node.attrs as BacklinkAttrs).id
    );
  }

  if (typeof node.type.spec.leafText === "function") {
    return node.type.spec.leafText(node);
  }

  return "";
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
            const { id } = node.attrs as BacklinkAttrs;

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
              return slice.content.textBetween(
                0,
                slice.content.size,
                "\n\n",
                (node) => clipboardLeafText(node, labelSnapshot),
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
