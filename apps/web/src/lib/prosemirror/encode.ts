import { prosemirrorJSONToYDoc } from "y-prosemirror";
import * as Y from "yjs";
import type { UnknownNodeJSON } from "../node-json";
import { NOTE_SCHEMA } from "./app-schema";
import { PROSEMIRROR_XML_FRAGMENT_KEY } from "./yjs";

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
