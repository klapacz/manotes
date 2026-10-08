/* eslint-disable anti-slop/no-unsafe-dictionary-type -- ProseMirror node and mark attributes depend on the installed plugins. */
export type UnknownNodeJSON = {
  type: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
  content?: Array<UnknownNodeJSON>;
  attrs?: Record<string, unknown>;
};
