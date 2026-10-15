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
import * as RecordCache from "../../record-cache.service";
import { bindRt, createAtomStore, createSyncedAtom } from "../..";
import { decodeBacklinkAttrs, type BacklinkAttrs } from "@manotes/shared/editor/backlink/spec";
import { RecordFormat } from "../../record";
import { RecordLink } from "../../record/link-component";

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
    const recordId = () => attrs().id;
    const recordIdAtom = createSyncedAtom(recordId);

    const state = createAtomStore(
      bindRt((rt) => {
        return rt.atom((get) => {
          const recordId = get(recordIdAtom);

          return RecordCache.Service.use((cache) => cache.changes(recordId)).pipe(
            Stream.unwrap,
            Stream.map(
              Option.match({
                onSome: (record): BacklinkLabelEntry => {
                  return BacklinkLabelEntry.Resolved({ title: RecordFormat.label(record) });
                },
                onNone: BacklinkLabelEntry.Missing,
              }),
            ),
          );
        });
      }),
      BacklinkLabelEntry.Loading(),
    );

    createEffect(() => {
      BacklinkLabelEntry.$match({
        Loading: () => labelSnapshot.delete(recordId()),
        Resolved: ({ title }) => labelSnapshot.set(recordId(), title),
        Missing: () => labelSnapshot.delete(recordId()),
      })(state.value);
    });

    const label = BacklinkLabelEntry.$match({
      Resolved: ({ title }) => title,
      Missing: () => "[unavailable record]",
      Loading: () => "",
    });

    return (
      <RecordLink
        id={recordId()}
        data-backlink=""
        data-backlink-state={state.value._tag}
        data-backlink-id={recordId()}
        contentEditable={false}
      >
        {label(state.value)}
      </RecordLink>
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
      nodesFromSchemaWrapper: (nodesFromSchema) => {
        return (schema) => {
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
        };
      },
    }),
    definePlugin(() => {
      return new Plugin({
        props: {
          clipboardTextSerializer(slice) {
            return slice.content.textBetween(0, slice.content.size, "\n\n", (node) => {
              return clipboardLeafText(node, labelSnapshot);
            });
          },
        },
      });
    }),
    defineSolidNodeView({
      name: "backlink",
      component: BacklinkView,
    }),
  );
}
