export type UnknownNodeJSON = {
  type: string;
  marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  text?: string;
  content?: Array<UnknownNodeJSON>;
  attrs?: Record<string, unknown>;
};
