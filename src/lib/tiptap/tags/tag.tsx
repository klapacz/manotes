import Mention from "@tiptap/extension-mention";
import { tagSuggestion } from "./suggestion";
import { type NodeViewProps } from "@tiptap/core";
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react";

function TagComponent(props: NodeViewProps) {
  const tagId = props.node.attrs.id as string;
  const label = (props.node.attrs.label as string) ?? tagId;

  return (
    // by default node view uses div as the wrapper element, tag should be inline
    <NodeViewWrapper as="span">
      <span className="backlink">#{label}</span>
    </NodeViewWrapper>
  );
}

export const Tag = Mention.extend({
  name: "tag",
  addNodeView() {
    return ReactNodeViewRenderer(TagComponent, {
      // by default node view uses div as the wrapper element, tag should be inline
      contentDOMElementTag: "span",
    });
  },
}).configure({
  suggestion: tagSuggestion,
});
