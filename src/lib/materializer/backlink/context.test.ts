import { describe, expect, it } from "vitest";
import type { UnknownNodeJSON } from "../../node-json";
import { extractBacklinkContexts } from "./context";

describe("extractBacklinkContexts", () => {
  const n = setupBuilders();

  it("extracts nested list context and uncollapses included lists", () => {
    const content = n.doc(
      n.heading(1, "Note title"),
      n.paragraph("Content before list"),
      n.list(
        { kind: "toggle", collapsed: true },
        n.paragraph("Grandparent"),
        n.list(
          { kind: "toggle", collapsed: true },
          n.paragraph("Parent"),
          n.list(
            { kind: "toggle", collapsed: true },
            n.paragraph("Sibling before"),
          ),
          n.list(
            { kind: "toggle", collapsed: true },
            n.paragraph(
              "Text before backlink ",
              n.backlink("test-id"),
              " Text after backlink",
            ),
            n.list({ kind: "toggle", collapsed: true }, n.paragraph("Child")),
          ),
          n.list(
            { kind: "toggle", collapsed: true },
            n.paragraph("Sibling after"),
          ),
        ),
      ),
      n.paragraph("Content after list"),
    );

    expect(
      extractBacklinkContexts({
        content,
        targetId: "test-id",
        isDaily: false,
      }),
    ).toEqual([
      n.list(
        { kind: "toggle", collapsed: false },
        n.paragraph("Parent"),
        n.list(
          { kind: "toggle", collapsed: false },
          n.paragraph(
            "Text before backlink ",
            n.backlink("test-id"),
            " Text after backlink",
          ),
          n.list({ kind: "toggle", collapsed: false }, n.paragraph("Child")),
        ),
      ),
    ]);
  });

  it("extracts heading context when the backlink is inside a heading", () => {
    const content = n.doc(
      n.heading(1, "Note title"),
      n.paragraph("Paragraph before heading"),
      n.heading(
        2,
        "Text before backlink ",
        n.backlink("test-id"),
        " Text after backlink",
      ),
      n.paragraph("Paragraph after heading"),
    );

    expect(
      extractBacklinkContexts({
        content,
        targetId: "test-id",
        isDaily: false,
      }),
    ).toEqual([
      n.heading(
        2,
        "Text before backlink ",
        n.backlink("test-id"),
        " Text after backlink",
      ),
    ]);
  });

  it("returns contexts in document order for multiple backlinks", () => {
    const content = n.doc(
      n.heading(1, "Note title"),
      n.paragraph("First ", n.backlink("test-id"), " backlink"),
      n.paragraph("Other ", n.backlink("other-id")),
      n.paragraph("Second ", n.backlink("test-id"), " backlink"),
    );

    expect(
      extractBacklinkContexts({
        content,
        targetId: "test-id",
        isDaily: false,
      }),
    ).toEqual([
      n.paragraph("First ", n.backlink("test-id"), " backlink"),
      n.paragraph("Second ", n.backlink("test-id"), " backlink"),
    ]);
  });

  it("deduplicates contexts when multiple backlinks are in the same node", () => {
    const content = n.doc(
      n.heading(1, "Note title"),
      n.paragraph(
        "like really well ",
        n.backlink("test-id"),
        " Foobar ",
        n.backlink("test-id"),
        ", wow, does it work? is it hacky?",
      ),
    );

    expect(
      extractBacklinkContexts({
        content,
        targetId: "test-id",
        isDaily: false,
      }),
    ).toEqual([
      n.paragraph(
        "like really well ",
        n.backlink("test-id"),
        " Foobar ",
        n.backlink("test-id"),
        ", wow, does it work? is it hacky?",
      ),
    ]);
  });

  it("deduplicates nested list contexts when multiple backlinks are in the same list item", () => {
    const content = n.doc(
      n.heading(1, "Note title"),
      n.list(
        { kind: "toggle", collapsed: true },
        n.paragraph("Parent"),
        n.list(
          { kind: "toggle", collapsed: true },
          n.paragraph(
            "Before ",
            n.backlink("test-id"),
            " middle ",
            n.backlink("test-id"),
            " after",
          ),
          n.list({ kind: "toggle", collapsed: true }, n.paragraph("Child")),
        ),
      ),
    );

    expect(
      extractBacklinkContexts({
        content,
        targetId: "test-id",
        isDaily: false,
      }),
    ).toEqual([
      n.list(
        { kind: "toggle", collapsed: false },
        n.paragraph("Parent"),
        n.list(
          { kind: "toggle", collapsed: false },
          n.paragraph(
            "Before ",
            n.backlink("test-id"),
            " middle ",
            n.backlink("test-id"),
            " after",
          ),
          n.list({ kind: "toggle", collapsed: false }, n.paragraph("Child")),
        ),
      ),
    ]);
  });

  it("returns one context per matching sibling list item", () => {
    const content = n.doc(
      n.heading(1, "Note title"),
      n.list(
        { kind: "toggle", collapsed: true },
        n.paragraph("Parent"),
        n.list(
          { kind: "toggle", collapsed: true },
          n.paragraph("Child A ", n.backlink("test-id")),
        ),
        n.list(
          { kind: "toggle", collapsed: true },
          n.paragraph("Child B ", n.backlink("test-id")),
        ),
      ),
    );

    expect(
      extractBacklinkContexts({
        content,
        targetId: "test-id",
        isDaily: false,
      }),
    ).toEqual([
      n.list(
        { kind: "toggle", collapsed: false },
        n.paragraph("Parent"),
        n.list(
          { kind: "toggle", collapsed: false },
          n.paragraph("Child A ", n.backlink("test-id")),
        ),
      ),
      n.list(
        { kind: "toggle", collapsed: false },
        n.paragraph("Parent"),
        n.list(
          { kind: "toggle", collapsed: false },
          n.paragraph("Child B ", n.backlink("test-id")),
        ),
      ),
    ]);
  });

  it("returns separate contexts for nested backlinks in different list items", () => {
    const content = n.doc(
      n.heading(1, "Note title"),
      n.list(
        { kind: "toggle", collapsed: true },
        n.paragraph("Parent"),
        n.list(
          { kind: "toggle", collapsed: true },
          n.paragraph("Child A ", n.backlink("test-id")),
          n.list(
            { kind: "toggle", collapsed: true },
            n.paragraph("Child B ", n.backlink("test-id")),
          ),
        ),
      ),
    );

    expect(
      extractBacklinkContexts({
        content,
        targetId: "test-id",
        isDaily: false,
      }),
    ).toEqual([
      n.list(
        { kind: "toggle", collapsed: false },
        n.paragraph("Parent"),
        n.list(
          { kind: "toggle", collapsed: false },
          n.paragraph("Child A ", n.backlink("test-id")),
          n.list(
            { kind: "toggle", collapsed: false },
            n.paragraph("Child B ", n.backlink("test-id")),
          ),
        ),
      ),
      n.list(
        { kind: "toggle", collapsed: false },
        n.paragraph("Child A ", n.backlink("test-id")),
        n.list(
          { kind: "toggle", collapsed: false },
          n.paragraph("Child B ", n.backlink("test-id")),
        ),
      ),
    ]);
  });

  it("returns an empty array when no matching backlinks exist", () => {
    const content = n.doc(
      n.heading(1, "Note title"),
      n.paragraph("Text without backlinks"),
    );

    expect(
      extractBacklinkContexts({
        content,
        targetId: "missing-id",
        isDaily: false,
      }),
    ).toEqual([]);
  });
});

function setupBuilders() {
  return {
    doc(...content: BlockNodeJSON[]): DocNodeJSON {
      return { type: "doc", content };
    },
    heading(level: number, ...content: InlinePart[]): HeadingNodeJSON {
      return {
        type: "heading",
        attrs: { level },
        content: inlineContent(...content),
      };
    },
    paragraph(...content: InlinePart[]): ParagraphNodeJSON {
      return {
        type: "paragraph",
        content: inlineContent(...content),
      };
    },
    list(
      attrs: ListAttrsInput,
      ...content: ListContentNodeJSON[]
    ): ListNodeJSON {
      return {
        type: "list",
        attrs: { checked: false, order: null, ...attrs },
        content,
      };
    },
    backlink(id: string): BacklinkNodeJSON {
      return { type: "backlink", attrs: { id, isDaily: false } };
    },
  };
}

function text(value: string): TextNodeJSON {
  return { type: "text", text: value };
}

function inlineContent(...content: InlinePart[]): InlineNodeJSON[] {
  return content.map((part) => (typeof part === "string" ? text(part) : part));
}

type TextNodeJSON = UnknownNodeJSON & {
  type: "text";
  text: string;
};

type BacklinkNodeJSON = UnknownNodeJSON & {
  type: "backlink";
  attrs: {
    id: string;
    isDaily: boolean;
  };
};

type ParagraphNodeJSON = UnknownNodeJSON & {
  type: "paragraph";
  content: InlineNodeJSON[];
};

type HeadingNodeJSON = UnknownNodeJSON & {
  type: "heading";
  attrs: {
    level: number;
  };
  content: InlineNodeJSON[];
};

type ListAttrsInput = {
  kind: string;
  collapsed: boolean;
} & Record<string, unknown>;

type ListNodeJSON = UnknownNodeJSON & {
  type: "list";
  attrs: {
    checked: boolean;
    order: number | null;
  } & ListAttrsInput;
  content: ListContentNodeJSON[];
};

type DocNodeJSON = UnknownNodeJSON & {
  type: "doc";
  content: BlockNodeJSON[];
};

type InlineNodeJSON = TextNodeJSON | BacklinkNodeJSON;
type InlinePart = string | InlineNodeJSON;
type ListContentNodeJSON = ParagraphNodeJSON | ListNodeJSON;
type BlockNodeJSON = HeadingNodeJSON | ParagraphNodeJSON | ListNodeJSON;
