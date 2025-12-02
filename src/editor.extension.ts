import { defineBaseCommands, defineBaseKeymap, union } from "prosekit/core";
import { defineDoc } from "prosekit/extensions/doc";
import { defineText } from "prosekit/extensions/text";
import { defineParagraph } from "prosekit/extensions/paragraph";
import { defineHeading } from "prosekit/extensions/heading";
import { defineList } from "prosekit/extensions/list";
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
import { defineGapCursor } from "prosekit/extensions/gap-cursor";
import { defineVirtualSelection } from "prosekit/extensions/virtual-selection";
import { defineModClickPrevention } from "prosekit/extensions/mod-click-prevention";

export function defineAppExtension() {
  return union(
    // Nodes
    defineDoc(),
    defineText(),
    defineParagraph(),
    defineHeading(),
    defineList(),
    defineBlockquote(),
    defineImage(),
    defineHorizontalRule(),
    defineHardBreak(),
    defineTable(),
    defineCodeBlock(),
    // Marks
    defineItalic(),
    defineBold(),
    defineUnderline(),
    defineStrike(),
    defineCode(),
    defineLink(),
    // Others
    defineBaseKeymap(),
    defineBaseCommands(),
    defineGapCursor(),
    defineVirtualSelection(),
    defineModClickPrevention(),
  );
}
