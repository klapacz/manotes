import Mention from "@tiptap/extension-mention";
import { backlinkSuggestion } from "./suggestion";
import { type NodeViewProps } from "@tiptap/core";
import { Link } from "@tanstack/react-router";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

function BacklinkComponent(props: NodeViewProps) {
  const noteId = props.node.attrs.id as string;
  const label = (props.node.attrs.label as string) ?? noteId;

  return (
    // by default node view uses div as the wrapper element, backlink should be inline
    <NodeViewWrapper as="span">
      <Link to="/notes/$noteId" params={{ noteId }} className="backlink">
        {label}
      </Link>
    </NodeViewWrapper>
  );
}

export const Backlink = Mention.extend({
  name: "backlink",
  addNodeView() {
    return ReactNodeViewRenderer(BacklinkComponent, {
      // by default node view uses div as the wrapper element, backlink should be inline
      contentDOMElementTag: "span",
    });
  },
}).configure({
  suggestion: backlinkSuggestion,
});
