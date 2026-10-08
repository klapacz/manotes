import { Schema } from "effect";
import { defineNodeSpec, union } from "prosekit/core";
import { defineText } from "prosekit/extensions/text";
import { defineParagraph } from "prosekit/extensions/paragraph";
import { defineHeading } from "prosekit/extensions/heading";
import { defineBlockquote } from "prosekit/extensions/blockquote";
import { defineHorizontalRule } from "prosekit/extensions/horizontal-rule";
import { defineHardBreak } from "prosekit/extensions/hard-break";
import { defineAppTableSpec } from "./lib/editor/table/spec";
import { defineCodeBlock } from "prosekit/extensions/code-block";
import { defineItalic } from "prosekit/extensions/italic";
import { defineBold } from "prosekit/extensions/bold";
import { defineStrike } from "prosekit/extensions/strike";
import { defineCode } from "prosekit/extensions/code";
import { defineAppLink } from "./lib/editor/link/spec";
import { defineBacklinkSpec } from "./lib/editor/backlink/spec";
import { defineStreamRefSpec } from "./lib/editor/stream-ref/spec";
import { defineAppListSpec } from "./lib/editor/list/extension";

function defineDoc() {
  return defineNodeSpec({
    name: "doc",
    content: "block+",
    topNode: true,
  });
}

/**
 * Pure ProseMirror schema (node and mark specs only).
 * Safe to import in workers and non-browser contexts (e.g. the materializer).
 */
export function defineAppSchema() {
  return union(
    // Nodes
    defineDoc(),
    defineText(),
    defineParagraph(),
    defineHeading(),
    defineAppListSpec(),
    defineBlockquote(),
    defineHorizontalRule(),
    defineHardBreak(),
    defineAppTableSpec(),
    defineCodeBlock(),
    defineNodeSpec({
      name: "codeBlock",
      attrs: { language: { default: "", validate: Schema.decodeUnknownSync(CodeLanguage) } },
    }),
    defineBacklinkSpec(),
    defineStreamRefSpec(),
    // Marks
    defineItalic(),
    defineBold(),
    defineStrike(),
    defineCode(),
    defineAppLink(),
  );
}

const CodeLanguage = Schema.String.annotate({ expected: "a code block language string" }).check(
  Schema.isPattern(/^[^`\r\n]*$/, {
    message: "Code block language must be a string without backticks or newlines",
  }),
);
