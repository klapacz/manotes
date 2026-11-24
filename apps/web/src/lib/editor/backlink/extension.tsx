import type { JSX } from "@solidjs/web";
import { RecordSchema } from "@manotes/shared/record.schema";
import { Data, Stream, Option } from "effect";
import { defineClipboardSerializer, definePlugin, union } from "prosekit/core";
import type { ProseMirrorNode } from "prosekit/pm/model";
import { Plugin } from "prosekit/pm/state";
import { defineSolidNodeView, type SolidNodeViewProps } from "@manotes/prosekit-solid";
import { createEffect, createMemo, Errored } from "solid-js";
import { RecordCache } from "../../record-cache.service";
import { useGraphStream } from "../..";
import { BacklinkSpec } from "@manotes/shared/editor/backlink/spec";
import { RecordFormat } from "../../record";
import { RecordLink } from "../../record/link-component";

// ---------------------------------------------------------------------------
// Node View
// ---------------------------------------------------------------------------

type BacklinkLabelEntry = Data.TaggedEnum<{
  Missing: {};
  Resolved: { title: string };
}>;

const BacklinkLabelEntry = Data.taggedEnum<BacklinkLabelEntry>();

function createBacklinkView(labelSnapshot: Map<RecordSchema.Id, string>) {
  return function BacklinkView(props: SolidNodeViewProps): JSX.Element {
    const attrs = createMemo(() => BacklinkSpec.decodeAttrs(props.node.attrs));
    const recordId = () => attrs().id;

    const record = useGraphStream(() => {
      const id = recordId();

      return RecordCache.Service.use((cache) => cache.changes(id)).pipe(Stream.unwrap);
    });

    const state = createMemo((): BacklinkLabelEntry => {
      return Option.match(record(), {
        onSome: (record) => BacklinkLabelEntry.Resolved({ title: RecordFormat.label(record) }),
        onNone: () => BacklinkLabelEntry.Missing(),
      });
    });

    createEffect(
      () => ({ id: recordId(), state: state() }),
      ({ id, state }) => {
        BacklinkLabelEntry.$match({
          Resolved: ({ title }) => labelSnapshot.set(id, title),
          Missing: () => labelSnapshot.delete(id),
        })(state);
      },
    );

    const label = () => {
      return BacklinkLabelEntry.$match(state(), {
        Resolved: ({ title }) => title,
        Missing: () => "[unavailable record]",
      });
    };

    return (
      <Errored
        fallback={
          <RecordLink
            id={recordId()}
            data-backlink=""
            data-backlink-state="Missing"
            data-backlink-id={recordId()}
            contenteditable="false"
          >
            [unavailable record]
          </RecordLink>
        }
      >
        <RecordLink
          id={recordId()}
          data-backlink=""
          data-backlink-state={state()._tag}
          data-backlink-id={recordId()}
          contenteditable="false"
        >
          {label()}
        </RecordLink>
      </Errored>
    );
  };
}

// ---------------------------------------------------------------------------
// Clipboard Serialization
// ---------------------------------------------------------------------------

function clipboardLeafText(
  node: ProseMirrorNode,
  labelSnapshot: ReadonlyMap<RecordSchema.Id, string>,
): string {
  if (node.type.name === "backlink") {
    const { id } = BacklinkSpec.decodeAttrs(node.attrs);

    return labelSnapshot.get(id) ?? id;
  }

  return node.type.spec.leafText?.(node) ?? "";
}

// ---------------------------------------------------------------------------
// Runtime Extension (node view + clipboard – requires browser/Solid)
// ---------------------------------------------------------------------------

export function defineBacklinkRuntime() {
  const labelSnapshot = new Map<RecordSchema.Id, string>();
  const BacklinkView = createBacklinkView(labelSnapshot);

  return union(
    defineClipboardSerializer({
      nodesFromSchemaWrapper: (nodesFromSchema) => {
        return (schema) => {
          const nodes = nodesFromSchema(schema);

          return {
            ...nodes,
            backlink: (node) => {
              const { id } = BacklinkSpec.decodeAttrs(node.attrs);

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
