import dedent from "dedent";
import { describe, expect, it } from "vite-plus/test";
import { MdParse } from "../lib/prosemirror/md/parse";
import { MdSerialize } from "../lib/prosemirror/md/serialize";
import { NOTE_SCHEMA } from "../lib/prosemirror/app-schema";
import { EditDocument, type Edit } from "./edit-document";

function edit(markdown: string, edits: readonly Edit[]) {
  return MdSerialize.serialize(EditDocument.apply(MdParse.parse(markdown), edits));
}

describe("EditDocument.apply", () => {
  it("applies replacements and appends in order", () => {
    expect(
      edit("start", [
        { kind: "replace", text: "start", with: "middle" },
        { kind: "append", markdown: "end" },
        { kind: "replace", text: "middle", with: "beginning" },
      ]),
    ).toBe("beginning\n\nend\n");
  });

  it("preserves untouched nodes, including formatting and backlinks", () => {
    const doc = MdParse.parse(dedent`
      Hello.

      - Keep **formatting** and [note](./note-id.md)
    `);

    const updated = EditDocument.apply(doc, [{ kind: "replace", text: "Hello", with: "Updated" }]);
    expect(updated.child(1)).toBe(doc.child(1));
    expect(updated.child(0).textContent).toBe("Updated.");
  });

  it("rejects no matches, even for all occurrences", () => {
    for (const occurrence of [undefined, "all"] as const) {
      expect(() =>
        edit("Hello", [{ kind: "replace", text: "missing", with: "x", occurrence }]),
      ).toThrow(/found 0/);
    }
  });

  it("rejects ambiguous matches unless an occurrence is supplied", () => {
    expect(() => edit("foo foo", [{ kind: "replace", text: "foo", with: "bar" }])).toThrow(
      /found 2/,
    );
  });

  it("selects zero-based occurrences, including a match at string offset zero", () => {
    expect(edit("foo foo", [{ kind: "replace", text: "foo", with: "bar", occurrence: 0 }])).toBe(
      "bar foo\n",
    );
    expect(edit("foo foo", [{ kind: "replace", text: "foo", with: "bar", occurrence: 1 }])).toBe(
      "foo bar\n",
    );

    for (const occurrence of [-1, 2, 0.5]) {
      expect(() =>
        edit("foo foo", [{ kind: "replace", text: "foo", with: "bar", occurrence }]),
      ).toThrow(/occurrence/);
    }
  });

  it("merges overlapping block ranges and replaces every match", () => {
    expect(
      edit("foo foo\n\nfoo", [{ kind: "replace", text: "foo", with: "longer", occurrence: "all" }]),
    ).toBe("longer longer\n\nlonger\n");
  });

  it("replaces across block and mark boundaries", () => {
    expect(
      edit("Hello **bold** world.\n\n## Log\n\nDone.", [
        {
          kind: "replace",
          text: "**bold** world.\n\n## Log",
          with: "*italic* there.\n\n## Journal",
        },
      ]),
    ).toBe("Hello *italic* there.\n\n## Journal\n\nDone.\n");
  });

  it("assigns separator whitespace to the following block", () => {
    expect(edit("a\n\nb", [{ kind: "replace", text: "\nb", with: "\nB" }])).toBe("a\n\nB\n");
  });

  it("removes empty blocks but keeps a paragraph when the whole note is deleted", () => {
    const doc = EditDocument.apply(MdParse.parse("a\n\nb\n\nc"), [
      { kind: "replace", text: "b", with: "" },
    ]);

    expect(doc.childCount).toBe(2);
    expect(MdSerialize.serialize(doc)).toBe("a\n\nc\n");

    const empty = EditDocument.apply(MdParse.parse("only"), [
      { kind: "replace", text: "only", with: "" },
    ]);

    expect(empty.toJSON()).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });

  it("inserts blocks and changes task state", () => {
    expect(
      edit("## Log\n\n- old entry", [
        { kind: "replace", text: "## Log", with: "## Log\n\n- new entry" },
      ]),
    ).toBe("## Log\n\n- new entry\n\n- old entry\n");

    const doc = EditDocument.apply(MdParse.parse("- [ ] Task one\n- [x] Task two"), [
      { kind: "replace", text: "- [ ] Task one", with: "- [x] Task one" },
    ]);

    expect(doc.child(0).attrs.checked).toBe(true);
    expect(doc.child(1).attrs.checked).toBe(true);
  });

  it("replaces the empty placeholder on append and ignores empty appends", () => {
    expect(edit("", [{ kind: "append", markdown: "Hello." }])).toBe("Hello.\n");
    const doc = MdParse.parse("Hello.");
    expect(EditDocument.apply(doc, [{ kind: "append", markdown: " \n" }])).toBe(doc);
    expect(EditDocument.apply(doc, [])).toBe(doc);
    expect(EditDocument.apply(doc, [{ kind: "replace", text: "Hello", with: "Hello" }])).toBe(doc);
  });

  it("leaves input unchanged if a later edit fails", () => {
    const doc = MdParse.parse("original");
    expect(() =>
      EditDocument.apply(doc, [
        { kind: "replace", text: "original", with: "changed" },
        { kind: "replace", text: "missing", with: "x" },
      ]),
    ).toThrow();
    expect(doc.textContent).toBe("original");
  });

  it("rejects an empty replacement anchor", () => {
    expect(() => edit("a", [{ kind: "replace", text: "", with: "x" }])).toThrow(
      /must not be empty/,
    );
  });

  it("rejects unsupported replacement content but can append without touching it", () => {
    const doc = NOTE_SCHEMA.node("doc", null, [
      NOTE_SCHEMA.node(
        "paragraph",
        null,
        NOTE_SCHEMA.text("underlined", [NOTE_SCHEMA.mark("underline")]),
      ),
    ]);

    // No-op replacements need neither a matching anchor nor serializable content.
    expect(EditDocument.apply(doc, [{ kind: "replace", text: "missing", with: "missing" }])).toBe(
      doc,
    );
    expect(() =>
      EditDocument.apply(doc, [{ kind: "replace", text: "underlined", with: "changed" }]),
    ).toThrow();
    const appended = EditDocument.apply(doc, [{ kind: "append", markdown: "new" }]);
    expect(appended.child(0)).toBe(doc.child(0));
    expect(appended.child(1).textContent).toBe("new");
  });
});
