import { RecordSchema } from "./record.schema";
import { describe, expect, it } from "vite-plus/test";
import { CliList } from "./list";

const item: CliList.Item = {
  id: RecordSchema.Id.make("record-1"),
  title: "Plan",
  text: "Plan First paragraph. Second paragraph.",
  date: "2026-11-08",
  createdAt: "2026-11-08T10:00:00.000Z",
  updatedAt: "2026-11-08T11:00:00.000Z",
  markdown: "# Plan\n\nFirst paragraph.\n\nSecond paragraph.\n",
  snippets: ["First paragraph."],
};

describe("CliList.format", () => {
  it.each([
    ["oneline", "Plan record-1 2026-11-08"],
    ["short", "Plan record-1 2026-11-08\n\n  First paragraph."],
    [
      "full",
      "Plan record-1 2026-11-08\n\n  # Plan\n  \n  First paragraph.\n  \n  Second paragraph.\n  ",
    ],
  ] as const)("renders %s without filenames or metadata", (format, expected) => {
    expect(CliList.format(format, [item])).toBe(expected);
  });

  it("uses Untitled and handles empty content and multiple records", () => {
    const empty = { ...item, title: null, snippets: [], markdown: "" };
    expect(CliList.format("short", [empty])).toBe("Untitled record-1 2026-11-08");
    expect(CliList.format("full", [empty])).toBe("Untitled record-1 2026-11-08");
    expect(CliList.format("oneline", [item, empty])).toBe(
      "Plan record-1 2026-11-08\nUntitled record-1 2026-11-08",
    );

    for (const format of ["oneline", "short", "full"] as const) {
      expect(CliList.format(format, [])).toBe("");
    }
  });

  it("preserves multiline Markdown snippets without character limits", () => {
    const snippet = "- [ ] " + "long text ".repeat(40) + "\n  continuation";
    expect(CliList.format("short", [{ ...item, snippets: [snippet, "```js\nrun();\n```"] }])).toBe(
      `Plan record-1 2026-11-08\n\n  ${snippet.replaceAll("\n", "\n  ")}\n  \n  \`\`\`js\n  run();\n  \`\`\``,
    );
  });
});
