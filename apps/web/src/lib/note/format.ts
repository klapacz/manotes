import type * as NoteSchema from "../note.schema";

type NotePreview = Pick<typeof NoteSchema.Preview.Type, "title" | "text">;

export function label(note: NotePreview): string {
  const label = note.title ?? note.text;
  return truncateLabel(label.length > 0 ? label : "Untitled note", 56);
}

function truncateLabel(label: string, maxLength: number): string {
  return label.length > maxLength ? `${label.slice(0, maxLength - 1)}...` : label;
}

export * as NoteFormat from "./format.ts";
