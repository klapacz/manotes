import * as Y from "yjs";

export const PROSEMIRROR_XML_FRAGMENT_KEY = "prosemirror";

export function getProsemirrorXmlFragment(doc: Y.Doc) {
  return doc.getXmlFragment(PROSEMIRROR_XML_FRAGMENT_KEY);
}
