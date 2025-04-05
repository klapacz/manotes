import {
  yXmlFragmentToProseMirrorRootNode,
  prosemirrorJSONToYDoc as prosemirrorJSONToYDocNative,
} from "y-prosemirror";
import * as Y from "yjs";
import { ProseUtils } from "./prose.utils";
import { JSONContent } from "@tiptap/core";

export namespace YjsUtils {
  export const schema = ProseUtils.getEditorShema();

  export function getNodeFromDoc(ydoc: Y.Doc) {
    const yXmlFragment = ydoc.get("prosemirror", Y.XmlFragment);
    const node = yXmlFragmentToProseMirrorRootNode(yXmlFragment, schema);
    return node;
  }

  export function prosemirrorJSONToYDoc(json: JSONContent) {
    return prosemirrorJSONToYDocNative(schema, json);
  }

  export function createDocFromUpdate(content: Uint8Array) {
    const doc = new Y.Doc();
    Y.applyUpdate(doc, content);
    return doc;
  }

  export function mergeDocs({
    localContent,
    remoteContent,
  }: {
    localContent: Uint8Array;
    remoteContent: Uint8Array;
  }) {
    const mergeDoc = new Y.Doc();
    Y.applyUpdate(mergeDoc, localContent);
    Y.applyUpdate(mergeDoc, remoteContent);

    const equalSnaphosts = compareSnapshots(remoteContent, mergeDoc);

    return {
      mergedYDoc: mergeDoc,
      equalSnaphosts,
    };
  }

  type CompareSnapshotItem = Uint8Array | Y.Doc;

  export function compareSnapshots(
    item1: CompareSnapshotItem,
    item2: CompareSnapshotItem,
  ) {
    return Y.equalSnapshots(
      marshallItemForComparing(item1),
      marshallItemForComparing(item2),
    );
  }

  function marshallItemForComparing(item: CompareSnapshotItem): Y.Snapshot {
    if (item instanceof Uint8Array) {
      const doc = new Y.Doc();
      Y.applyUpdate(doc, item);
      return Y.snapshot(doc);
    }
    return Y.snapshot(item);
  }
}
