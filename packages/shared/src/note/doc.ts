import * as Y from "yjs";
import { AttrsSchema } from "../attrs.schema";
import { YSchema } from "../y-schema";

export function make() {
  return fromDoc({ doc: new Y.Doc() });
}

export function fromDoc(opts: { readonly doc: Y.Doc }) {
  return {
    doc: opts.doc,
    attrs: YSchema.make({ schema: AttrsSchema.Attrs, map: opts.doc.getMap("attrs") }),
  };
}

export * as NoteDoc from "./doc";
