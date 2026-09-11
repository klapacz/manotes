import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";
import { NOTE_SCHEMA } from "../app-schema";
import { MdParse } from "./parse";
import { MdSerialize } from "./serialize";

describe("app Markdown conversion", () => {
  it.each([
    dedent`
      - first
      - second
        - nested
          - deeper
      - last
    `,
    dedent`
      3. third
      4. fourth
         - nested
      5. fifth
    `,
    dedent`
      - [ ] open
      - [x] done
        - [X] nested
      - ordinary
    `,
    dedent`
      - first paragraph

        second paragraph

        > quote

      - next item
    `,
  ])("preserves FlatList nesting and item content: %s", (markdown) => {
    const doc = MdParse.parse(markdown);
    const output = MdSerialize.serialize(doc);
    expect(MdParse.parse(output).toJSON()).toEqual(doc.toJSON());
    expect(MdSerialize.serialize(MdParse.parse(output))).toBe(output);
  });

  it("maps Markdown marks to app mark names in both directions", () => {
    const markdown = "**bold** *italic* ~~strike~~ `code` [link](https://example.com)";
    const doc = MdParse.parse(markdown);
    const paragraph = doc.firstChild!;
    expect([0, 2, 4, 6, 8].map((index) => paragraph.child(index).marks[0]!.type.name)).toEqual([
      "bold",
      "italic",
      "strike",
      "code",
      "link",
    ]);
    expect(MdSerialize.serialize(doc).trimEnd()).toBe(markdown);
  });

  it("uses FlatList items without wrapper nodes", () => {
    const doc = MdParse.parse(dedent`
      3. third
      4. fourth
         - [x] nested

      - plain
    `);
    expect(doc.childCount).toBe(3);
    expect(doc.child(0).type.name).toBe("list");
    expect(doc.child(0).attrs).toMatchObject({ kind: "ordered", order: 1 });
    expect(doc.child(1).attrs).toMatchObject({ kind: "ordered", order: 2 });
    expect(doc.child(1).child(1).attrs).toMatchObject({ kind: "task", checked: true });
    expect(doc.child(2).attrs.kind).toBe("toggle");
  });

  it("maps relative note links to atoms and resolves display labels only on export", () => {
    const doc = MdParse.parse(
      "See [**Display**](./note%20%281%29.md) and [remote](https://example.com/note.md).",
    );
    const backlink = doc.firstChild!.child(1);
    expect(backlink.type.name).toBe("backlink");
    expect(backlink.attrs.id).toBe("note (1)");
    const output = MdSerialize.serialize(doc, { backlinkLabel: () => "A [label] *with* marks" });
    expect(output).toContain("[A \\[label\\] \\*with\\* marks](./note%20%281%29.md)");
    expect(MdParse.parse(output).toJSON()).toEqual(doc.toJSON());
    expect(MdSerialize.serialize(doc)).toContain("[note (1)]");
  });

  it("preserves text and marks around adjacent backlinks", () => {
    const doc = MdParse.parse(
      "Before **[one](./one.md)[two](./two.md)** after [web](https://example.com).",
    );
    const paragraph = doc.firstChild!;
    expect(paragraph.child(0).text).toBe("Before ");
    expect(paragraph.child(1).attrs.id).toBe("one");
    expect(paragraph.child(2).attrs.id).toBe("two");
    expect(paragraph.child(1).marks[0]!.type.name).toBe("bold");
    expect(paragraph.child(2).marks[0]!.type.name).toBe("bold");
    expect(paragraph.child(3).text).toBe(" after ");
    expect(MdParse.parse(MdSerialize.serialize(doc)).eq(doc)).toBe(true);
  });

  it("distinguishes escaped task markers from actual tasks", () => {
    const doc = MdParse.parse(dedent`
      - \[x] literal
      - [X] checked
      - [ ] unchecked
    `);
    expect(doc.child(0).attrs.kind).toBe("toggle");
    expect(doc.child(0).textContent).toBe("[x] literal");
    expect(doc.child(1).attrs).toMatchObject({ kind: "task", checked: true });
    expect(doc.child(2).attrs).toMatchObject({ kind: "task", checked: false });
  });

  it("does not mistake other relative links for backlinks", () => {
    const doc = MdParse.parse(
      "[asset](./asset.png) [parent](../note.md) [fragment](./note.md#section)",
    );
    expect(doc.firstChild!.child(0).marks[0]!.type.name).toBe("link");
    expect(doc.firstChild!.child(2).marks[0]!.type.name).toBe("link");
    expect(doc.firstChild!.child(4).marks[0]!.type.name).toBe("link");
  });

  it("preserves code whitespace and chooses a long enough fence", () => {
    // Keep the boundary whitespace explicit, since dedent normally trims it.
    const text =
      "  " +
      dedent`
      code${"  "}
      \`\`\`\`
    ` +
      "\n\n";
    const doc = NOTE_SCHEMA.node(
      "doc",
      null,
      NOTE_SCHEMA.node("codeBlock", { language: "ts" }, NOTE_SCHEMA.text(text)),
    );
    expect(MdSerialize.serialize(doc)).toContain("`````ts");
    expect(MdParse.parse(MdSerialize.serialize(doc)).eq(doc)).toBe(true);
  });

  it("records contiguous block spans with separators on the following block", () => {
    const doc = MdParse.parse(dedent`
      # Heading

      Paragraph

      - one
      - two

      \`\`\`
      code
      \`\`\`
    `);
    const { markdown, blocks } = MdSerialize.withBlockSpans(doc);
    expect(markdown).toBe(MdSerialize.serialize(doc));
    expect(blocks).toHaveLength(doc.childCount);
    expect(blocks[0]!.mdFrom).toBe(0);
    expect(blocks.at(-1)!.mdTo).toBe(markdown.length);
    blocks.forEach((block, index) => {
      if (index) expect(block.mdFrom).toBe(blocks[index - 1]!.mdTo);
      expect(
        MdParse.parse(markdown.slice(block.mdFrom, block.mdTo)).firstChild!.eq(doc.child(index)),
      ).toBe(true);
    });
  });

  it("rejects unsupported tables and marks instead of dropping content", () => {
    expect(() =>
      MdParse.parse(dedent`
      | A | B |
      | --- | --- |
      | one | two |
    `),
    ).toThrow(/table/);
    const cell = NOTE_SCHEMA.node("tableCell", null, NOTE_SCHEMA.node("paragraph"));
    const table = NOTE_SCHEMA.node("table", null, NOTE_SCHEMA.node("tableRow", null, cell));
    expect(() => MdSerialize.serialize(NOTE_SCHEMA.node("doc", null, table))).toThrow(/table/);
    const underlined = NOTE_SCHEMA.text("keep me", [NOTE_SCHEMA.mark("underline")]);
    const doc = NOTE_SCHEMA.node("doc", null, NOTE_SCHEMA.node("paragraph", null, underlined));
    expect(() => MdSerialize.serialize(doc)).toThrow(/underline/);
  });

  it("numbers imported ordered items by position and resets each list run", () => {
    const doc = MdParse.parse(dedent`
      3. first
      1. second

      - outer

        7. nested first
        2. nested second

      8. new run
    `);
    expect(doc.child(0).attrs.order).toBe(1);
    expect(doc.child(1).attrs.order).toBe(2);
    expect(doc.child(2).child(1).attrs.order).toBe(1);
    expect(doc.child(2).child(2).attrs.order).toBe(2);
    expect(doc.child(3).attrs.order).toBe(1);
    expect(MdParse.parse(MdSerialize.serialize(doc)).eq(doc)).toBe(true);
  });

  it("overrides stored numbering on export without mutating the source", () => {
    const paragraph = NOTE_SCHEMA.node("paragraph", null, NOTE_SCHEMA.text("item"));
    const nested = NOTE_SCHEMA.node("list", { kind: "ordered", order: 9 }, paragraph);
    const doc = NOTE_SCHEMA.node("doc", null, [
      NOTE_SCHEMA.node("list", { kind: "ordered", order: 3 }, [paragraph, nested]),
      NOTE_SCHEMA.node("list", { kind: "ordered", order: 1 }, paragraph),
      NOTE_SCHEMA.node("list", { kind: "ordered" }, paragraph),
      paragraph,
      NOTE_SCHEMA.node("list", { kind: "ordered", order: 42 }, paragraph),
    ]);
    const before = doc.toJSON();
    const { markdown, blocks } = MdSerialize.withBlockSpans(doc);
    expect(markdown.match(/^\d+\. /gm)).toEqual(["1. ", "2. ", "3. ", "1. "]);
    expect(markdown).toContain("   1. item");
    expect(markdown.slice(blocks[1]!.mdFrom, blocks[1]!.mdTo)).toContain("2. item");
    expect(MdParse.parse(markdown).child(0).child(1).attrs.order).toBe(1);
    expect(doc.toJSON()).toEqual(before);
  });

  it.each([
    42,
    "`ts",
    dedent`
    ts
    injected
  `,
  ])("rejects invalid code languages: %s", (language) => {
    const code = NOTE_SCHEMA.node("codeBlock", { language }, NOTE_SCHEMA.text("code"));
    expect(() => MdSerialize.serialize(NOTE_SCHEMA.node("doc", null, code))).toThrow(/language/);
  });

  it("rejects non-boolean task state and empty backlink ids", () => {
    const task = NOTE_SCHEMA.node(
      "list",
      { kind: "task", checked: "false" },
      NOTE_SCHEMA.node("paragraph"),
    );
    expect(() => MdSerialize.serialize(NOTE_SCHEMA.node("doc", null, task))).toThrow(/boolean/);
    const paragraph = NOTE_SCHEMA.node("paragraph", null, NOTE_SCHEMA.node("backlink", { id: "" }));
    expect(() => MdSerialize.serialize(NOTE_SCHEMA.node("doc", null, paragraph))).toThrow(
      /nonempty string/,
    );
  });

  it("normalizes collapse state without mutating the source document", () => {
    const item = NOTE_SCHEMA.node(
      "list",
      { kind: "toggle", collapsed: true },
      NOTE_SCHEMA.node("paragraph", null, NOTE_SCHEMA.text("hidden")),
    );
    const doc = NOTE_SCHEMA.node("doc", null, item);
    const before = doc.toJSON();
    expect(MdParse.parse(MdSerialize.serialize(doc)).firstChild!.attrs.collapsed).toBe(false);
    expect(doc.toJSON()).toEqual(before);
  });
});
