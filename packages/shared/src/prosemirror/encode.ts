import { prosemirrorJSONToYXmlFragment } from "y-prosemirror";
import * as Y from "yjs";
import type { UnknownNodeJSON } from "../node-json";
import { RECORD_SCHEMA } from "./app-schema";
import { getProsemirrorXmlFragment } from "./yjs";

export function initializeDocument(opts: {
  readonly doc: Y.Doc;
  readonly content: readonly UnknownNodeJSON[];
}): void {
  prosemirrorJSONToYXmlFragment(
    RECORD_SCHEMA,
    { type: "doc", content: opts.content },
    getProsemirrorXmlFragment(opts.doc),
  );
}

export function encodeDocument(content: readonly UnknownNodeJSON[]): Uint8Array {
  const doc = new Y.Doc();

  try {
    initializeDocument({ doc, content });

    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}

export * as ProsemirrorEncode from "./encode";
