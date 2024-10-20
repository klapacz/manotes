import { BacklinkContext } from "./backlinks-context";
import { Editor } from "@tiptap/core";
import { Tag } from "../tiptap/tags/tag";
import LinkExtension from "@tiptap/extension-link";
import { FlatListNode } from "../tiptap/flat-list-extension";
import { Backlink } from "../tiptap/backlink/backlink";
import StarterKit from "@tiptap/starter-kit";
import { builders } from "prosemirror-test-builder";
import { HeadingExtension } from "../tiptap/heading/heading";
import { DocExtension } from "../tiptap/doc/doc";

describe("BacklinkContext", () => {
  describe("extractContext", () => {
    it("should extract context for a backlink in a nested list structure", () => {
      const { b } = setupEditor();

      const initialDoc = b.doc(
        b.h1("Note title"),
        b.p("Content before list"),
        b.list(
          b.p("Grandparent"),
          b.list(
            b.p("Parent"),
            b.list(b.p("Sibling before")),
            b.list(
              b.p(
                "Text before backlink ",
                b.backlink({ id: "test-id", label: "Test Backlink" }),
                " Text after backlink",
              ),
              b.list(b.p("Child")),
            ),
            b.list(b.p("Sibling after")),
          ),
        ),
        b.p("Content after list"),
      );

      const expectedDoc = b.list(
        b.p("Parent"),
        b.list(
          b.p(
            "Text before backlink ",
            b.backlink({ id: "test-id", label: "Test Backlink" }),
            " Text after backlink",
          ),
          b.list(b.p("Child")),
        ),
      );

      const backlinkInfo = BacklinkContext.findBacklinkNode(
        initialDoc,
        "test-id",
      )!;
      const context = BacklinkContext.extractBacklinkContext(
        initialDoc,
        backlinkInfo,
      );
      expect(context).toEqualProsemirrorNode(expectedDoc);
    });

    it("should extract context for a backlink in a heading", () => {
      const { b } = setupEditor();

      const initialDoc = b.doc(
        b.h1("Note title"),
        b.p("Paragraph before heading"),
        b.h2(
          "Text before backlink ",
          b.backlink({ id: "test-id", label: "Test Backlink" }),
          " Text after backlink",
        ),
        b.p("Paragraph after heading"),
      );

      const expectedDoc = b.h2(
        "Text before backlink ",
        b.backlink({ id: "test-id", label: "Test Backlink" }),
        " Text after backlink",
      );

      const backlinkInfo = BacklinkContext.findBacklinkNode(
        initialDoc,
        "test-id",
      )!;
      const context = BacklinkContext.extractBacklinkContext(
        initialDoc,
        backlinkInfo,
      );
      expect(context).toEqualProsemirrorNode(expectedDoc);
    });
  });
});

function setupEditor() {
  const editor = new Editor({
    extensions: [
      StarterKit.configure({
        listItem: false,
        bulletList: false,
        orderedList: false,
        document: false,
        heading: false,
      }),
      HeadingExtension,
      Tag,
      LinkExtension,
      FlatListNode,
      Backlink,
      DocExtension,
    ],
    content: "",
  });

  // TODO: typesafe builders
  let b = builders(editor.schema, {
    p: { nodeType: "paragraph" },
    doc: { nodeType: "doc" },
    h1: { nodeType: "heading", level: 1 },
    h2: { nodeType: "heading", level: 1 },
    bullet: { nodeType: "list", attrs: { kind: "bullet" } },
  }) as any;

  return { editor, b };
}
