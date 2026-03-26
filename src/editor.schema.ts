import { defineNodeSpec, union } from "prosekit/core";
import { defineText } from "prosekit/extensions/text";
import { defineParagraph } from "prosekit/extensions/paragraph";
import { defineHeading } from "prosekit/extensions/heading";
import { defineBlockquote } from "prosekit/extensions/blockquote";
import { defineImage } from "prosekit/extensions/image";
import { defineHorizontalRule } from "prosekit/extensions/horizontal-rule";
import { defineHardBreak } from "prosekit/extensions/hard-break";
import { defineTable } from "prosekit/extensions/table";
import { defineCodeBlock } from "prosekit/extensions/code-block";
import { defineItalic } from "prosekit/extensions/italic";
import { defineBold } from "prosekit/extensions/bold";
import { defineUnderline } from "prosekit/extensions/underline";
import { defineStrike } from "prosekit/extensions/strike";
import { defineCode } from "prosekit/extensions/code";
import { defineLink } from "prosekit/extensions/link";
import { defineBacklinkSpec } from "./lib/editor/backlink/spec";
import { defineAppListSpec } from "./lib/editor/list/extension";

export type DefineAppSchemaOptions = {
  isDaily: boolean;
};

function defineDoc(options: DefineAppSchemaOptions) {
  return defineNodeSpec({
    name: "doc",
    content: options.isDaily ? "block+" : "heading block+",
    topNode: true,
  });
}

/**
 * Pure ProseMirror schema (node and mark specs only).
 * Safe to import in workers and non-browser contexts (e.g. the materializer).
 */
export function defineAppSchema(options: DefineAppSchemaOptions) {
  return union(
    // Nodes
    defineDoc(options),
    defineText(),
    defineParagraph(),
    defineHeading(),
    defineAppListSpec(),
    defineBlockquote(),
    defineImage(),
    defineHorizontalRule(),
    defineHardBreak(),
    defineTable(),
    defineCodeBlock(),
    defineBacklinkSpec(),
    // Marks
    defineItalic(),
    defineBold(),
    defineUnderline(),
    defineStrike(),
    defineCode(),
    defineLink(),
  );
}
