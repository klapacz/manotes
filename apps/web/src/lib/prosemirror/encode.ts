import { prosemirrorJSONToYDoc } from "y-prosemirror";
import * as Y from "yjs";
import type { UnknownNodeJSON } from "@manotes/shared/node-json";
import { NOTE_SCHEMA } from "@manotes/shared/prosemirror/app-schema";
import { PROSEMIRROR_XML_FRAGMENT_KEY } from "@manotes/shared/prosemirror/yjs";

export function encodeDocument(content: UnknownNodeJSON[]) {
  const doc = prosemirrorJSONToYDoc(
    NOTE_SCHEMA,
    { type: "doc", content },
    PROSEMIRROR_XML_FRAGMENT_KEY,
  );

  try {
    return Y.encodeStateAsUpdate(doc);
  } finally {
    doc.destroy();
  }
}

export * as ProsemirrorEncode from "./encode";
