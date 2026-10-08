import dedent from "dedent";
import { createEditor, union } from "prosekit/core";
import { defineAppSchema } from "../../../editor.schema";
import { defineAppTableExtension } from "../../editor/table/spec";
import { describe, expect, it } from "vite-plus/test";
import { NOTE_SCHEMA } from "../app-schema";
import { MdParse } from "./parse";
import { MdSerialize } from "./serialize";
import { decodeStreamRefAttrs, streamRefLabel } from "../../editor/stream-ref/spec";

describe("app Markdown conversion", () => {
  it.each(["list", "blockquote"])("keeps code fences inside %s containers", (container) => {
    const paragraph = (text: string) => NOTE_SCHEMA.node("paragraph", null, NOTE_SCHEMA.text(text));

    const code = NOTE_SCHEMA.node(
      "codeBlock",
      { language: "ts" },
      NOTE_SCHEMA.text("const n = 1;"),
    );

    const content = [
      ...(container === "list" ? [paragraph("parent")] : []),
      NOTE_SCHEMA.node(container, null, [code]),
      NOTE_SCHEMA.node("list", null, [
        NOTE_SCHEMA.node("paragraph", null, NOTE_SCHEMA.node("backlink", { id: "after-code" })),
      ]),
    ];

    const doc = NOTE_SCHEMA.node("doc", null, [NOTE_SCHEMA.node(container, null, content)]);

    expect(MdParse.parse(MdSerialize.serialize(doc)).eq(doc)).toBe(true);
  });

  it.each([" ", "\t", " \t\n"])("preserves whitespace-only paragraphs: %j", (text) => {
    const paragraph = NOTE_SCHEMA.node("paragraph", null, NOTE_SCHEMA.text(text));

    const doc = NOTE_SCHEMA.node("doc", null, [
      paragraph,
      NOTE_SCHEMA.node("list", null, [paragraph]),
      NOTE_SCHEMA.node("blockquote", null, [paragraph]),
    ]);

    expect(MdParse.parse(MdSerialize.serialize(doc)).eq(doc)).toBe(true);
  });

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

  it("round-trips stream settings as an inline ref without a pane identity or URL", () => {
    const attrs = decodeStreamRefAttrs({
      paneId: "source-pane",
      href: "https://old-device.example/graph",
      filter: {
        type: "pages",
        search: "a & b [x] (é)!",
        backlinksTo: "project",
        linksFrom: "article",
        date: "2026-10-04",
      },
      sort: "updated",
      view: "snippets",
    });

    const doc = NOTE_SCHEMA.node(
      "doc",
      null,
      NOTE_SCHEMA.node("paragraph", null, [
        NOTE_SCHEMA.text("See "),
        NOTE_SCHEMA.node("streamRef", attrs),
        NOTE_SCHEMA.text(" for more."),
      ]),
    );

    const markdown = MdSerialize.serialize(doc);

    expect(attrs).not.toHaveProperty("paneId");
    expect(attrs).not.toHaveProperty("href");
    expect(MdParse.parse(markdown).toJSON()).toEqual(doc.toJSON());
    expect(markdown).toContain("stream:");
    expect(streamRefLabel({ filter: { type: "pages" }, sort: "updated", view: "full" })).toBe(
      "Pages",
    );
    expect(streamRefLabel({ filter: { type: "notes" }, sort: "date", view: "full" })).toBe("Notes");
    expect(streamRefLabel(attrs)).toContain("snippets");
    expect(decodeStreamRefAttrs({ filter: { type: "notes" } })).toMatchObject({
      sort: "date",
      view: "full",
    });
    expect(() => decodeStreamRefAttrs({ ...attrs, sort: "invalid" })).toThrow();
    expect(() => MdParse.parse("[Stream](stream:%7Bbroken)")).toThrow();
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

  it("preserves leading, trailing, consecutive, and nested empty paragraphs", () => {
    const empty = NOTE_SCHEMA.node("paragraph");
    const text = NOTE_SCHEMA.node("paragraph", null, NOTE_SCHEMA.text("text"));

    const doc = NOTE_SCHEMA.node("doc", null, [
      empty,
      empty,
      text,
      empty,
      empty,
      NOTE_SCHEMA.node("blockquote", null, [empty, text, empty]),
      NOTE_SCHEMA.node("list", { kind: "toggle" }, [empty, text, empty]),
      NOTE_SCHEMA.node("list", { kind: "task", checked: true }, [empty, text, empty]),
      NOTE_SCHEMA.node("list", { kind: "ordered", order: 1 }, [empty, text, empty]),
      empty,
    ]);

    const { markdown, blocks } = MdSerialize.withBlockSpans(doc);
    expect(markdown).toContain("<!-- manotes:empty-paragraph -->");
    expect(MdParse.parse(markdown).toJSON()).toEqual(doc.toJSON());
    blocks.forEach((block, index) => {
      expect(
        MdParse.parse(markdown.slice(block.mdFrom, block.mdTo)).firstChild!.eq(doc.child(index)),
      ).toBe(true);
    });
    expect(
      MdParse.parse(MdSerialize.serialize(NOTE_SCHEMA.node("doc", null, [empty, empty])))
        .childCount,
    ).toBe(2);
  });

  it("keeps the reserved marker literal in text, code, and table cells", () => {
    const marker = "<!-- manotes:empty-paragraph -->";
    const paragraph = NOTE_SCHEMA.node("paragraph", null, NOTE_SCHEMA.text(marker));
    const code = NOTE_SCHEMA.node("codeBlock", null, NOTE_SCHEMA.text(marker));
    const cell = (type: string) => NOTE_SCHEMA.node(type, null, paragraph);

    const table = NOTE_SCHEMA.node("table", null, [
      NOTE_SCHEMA.node("tableRow", null, cell("tableHeaderCell")),
      NOTE_SCHEMA.node("tableRow", null, cell("tableCell")),
    ]);

    const doc = NOTE_SCHEMA.node("doc", null, [paragraph, code, table]);
    const markdown = MdSerialize.serialize(doc);
    expect(markdown).toContain("\\<!-- manotes:empty-paragraph -->");
    expect(MdParse.parse(markdown).eq(doc)).toBe(true);
  });

  it("removes unsupported image and underline types and link browser attributes", () => {
    expect(NOTE_SCHEMA.nodes.image).toBeUndefined();
    expect(NOTE_SCHEMA.marks.underline).toBeUndefined();
    expect(
      NOTE_SCHEMA.mark("link", { href: "https://example.com", target: "_blank", rel: "nofollow" })
        .attrs,
    ).toEqual({ href: "https://example.com" });
    expect(() => MdParse.parse("![alt](image.png)")).toThrow(/image/);
  });

  it.each([
    "| A | B |\n| --- | --- |\n| one | two |",
    "| A | B | C |\n| :--- | :---: | ---: |\n| one | | three |",
    "| **bold** | *italic* |\n| --- | --- |\n| ~~strike~~ | `code` |",
    "| A | B |\n| --- | --- |\n| a\\|b | `c\\|d` |",
    "| A | B |\n| --- | --- |\n| [note](./note.md) | [web](https://example.com) |",
    "| Empty |\n| --- |",
    "> | A | B |\n> | --- | --- |\n> | one | two |",
    "- item\n\n  | A | B |\n  | --- | --- |\n  | one | two |",
  ])("round-trips Markdown tables: %s", (markdown) => {
    const doc = MdParse.parse(markdown);
    const output = MdSerialize.serialize(doc);
    expect(MdParse.parse(output).eq(doc)).toBe(true);
    expect(MdSerialize.serialize(MdParse.parse(output))).toBe(output);
  });

  it("round-trips an editor-created aligned table with a stream ref and records its block span", () => {
    const cell = (type: string, content: ReturnType<typeof NOTE_SCHEMA.text>[]) =>
      NOTE_SCHEMA.node(type, { align: "center" }, NOTE_SCHEMA.node("paragraph", null, content));

    const table = NOTE_SCHEMA.node("table", null, [
      NOTE_SCHEMA.node("tableRow", null, cell("tableHeaderCell", [NOTE_SCHEMA.text("Header")])),
      NOTE_SCHEMA.node(
        "tableRow",
        null,
        cell("tableCell", [
          NOTE_SCHEMA.text("pipe |", [NOTE_SCHEMA.mark("bold")]),
          NOTE_SCHEMA.text(" "),
          NOTE_SCHEMA.node("streamRef", decodeStreamRefAttrs({ filter: { type: "notes" } })),
        ]),
      ),
    ]);

    const doc = NOTE_SCHEMA.node("doc", null, [
      NOTE_SCHEMA.node("paragraph", null, NOTE_SCHEMA.text("before")),
      table,
    ]);

    const { markdown, blocks } = MdSerialize.withBlockSpans(doc);
    expect(MdParse.parse(markdown).toJSON()).toEqual(doc.toJSON());
    expect(
      MdParse.parse(markdown.slice(blocks[1]!.mdFrom, blocks[1]!.mdTo)).firstChild!.eq(table),
    ).toBe(true);
  });

  it("keeps table editing within the supported schema", () => {
    const editor = createEditor({ extension: union(defineAppSchema(), defineAppTableExtension()) });
    editor.commands.insertTable({ row: 2, col: 2 });
    const table = editor.state.doc.firstChild!;
    expect(table.type.name).toBe("table");
    expect(table.firstChild!.firstChild!.type.name).toBe("tableHeaderCell");
    expect(editor.commands).not.toHaveProperty("mergeTableCells");
    expect(editor.commands).not.toHaveProperty("splitTableCell");
    editor.commands.selectTableCell({ pos: 4 });
    expect(editor.commands.addTableRowBelow.canExec()).toBe(true);
    editor.commands.addTableRowBelow();
    expect(editor.state.doc.firstChild!.childCount).toBe(3);
    expect(
      MdParse.parse(MdSerialize.serialize(editor.state.doc), editor.schema).firstChild!.eq(
        editor.state.doc.firstChild!,
      ),
    ).toBe(true);
  });

  it("preserves column alignment when adding rows and columns", () => {
    const doc = MdParse.parse("| A | B |\n| :---: | ---: |\n| one | two |");

    const editor = createEditor({
      extension: union(defineAppSchema(), defineAppTableExtension()),
      defaultContent: doc.toJSON(),
    });

    editor.commands.selectTableCell({ pos: 4 });
    editor.commands.addTableRowBelow();
    editor.commands.addTableColumnAfter();
    expect(editor.state.doc.firstChild!.childCount).toBe(3);
    expect(editor.state.doc.firstChild!.firstChild!.childCount).toBe(3);
    expect(
      MdParse.parse(MdSerialize.serialize(editor.state.doc), editor.schema).eq(editor.state.doc),
    ).toBe(true);
  });

  it("rejects merged cells, multi-block cells, ragged rows, missing headers, and cell line breaks", () => {
    const paragraph = NOTE_SCHEMA.node("paragraph", null, NOTE_SCHEMA.text("cell"));
    const cell = NOTE_SCHEMA.node("tableCell", null, paragraph);
    const header = NOTE_SCHEMA.node("tableHeaderCell", null, paragraph);
    const row = (cells: (typeof cell)[]) => NOTE_SCHEMA.node("tableRow", null, cells);

    const exportRows = (rows: ReturnType<typeof row>[]) =>
      MdSerialize.serialize(NOTE_SCHEMA.node("doc", null, NOTE_SCHEMA.node("table", null, rows)));

    expect(() => exportRows([row([cell])])).toThrow(/header/);
    expect(() => exportRows([row([header, header]), row([cell])])).toThrow(/width/);
    expect(() =>
      exportRows([row([header]), row([NOTE_SCHEMA.node("tableCell", { colspan: 2 }, paragraph)])]),
    ).toThrow();
    expect(() =>
      exportRows([
        row([header]),
        row([NOTE_SCHEMA.node("tableCell", null, [paragraph, paragraph])]),
      ]),
    ).toThrow();

    const broken = NOTE_SCHEMA.node(
      "tableCell",
      null,
      NOTE_SCHEMA.node("paragraph", null, [
        NOTE_SCHEMA.text("a"),
        NOTE_SCHEMA.node("hardBreak"),
        NOTE_SCHEMA.text("b"),
      ]),
    );

    expect(() => exportRows([row([header]), row([broken])])).toThrow(/line breaks/);
  });

  it.each([
    "**bold *italic* text**",
    "[**bold** `code`](https://example.com)",
    "``code ` tick``",
    "\\*literal\\* \\_text\\_ \\~\\~strike\\~\\~",
    "before\\\nnext",
    "# Heading\n\n> quote\n\n---\n\nparagraph",
  ])("round-trips retained nodes and formatting combinations: %s", (markdown) => {
    const doc = MdParse.parse(markdown);
    expect(MdParse.parse(MdSerialize.serialize(doc)).eq(doc)).toBe(true);
  });

  it("rejects an unsupported internal list kind at schema validation", () => {
    expect(() =>
      NOTE_SCHEMA.node("list", { kind: "bullet" }, NOTE_SCHEMA.node("paragraph")),
    ).toThrow();
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
    expect(() => {
      const code = NOTE_SCHEMA.node("codeBlock", { language }, NOTE_SCHEMA.text("code"));
      MdSerialize.serialize(NOTE_SCHEMA.node("doc", null, code));
    }).toThrow(/language|string/);
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
