import { z } from "zod";

const vectorClockSchema = z.record(z.string(), z.number());

const noteUpdateRecord = z.object({
  id: z.string(),
  vectorClock: vectorClockSchema,
  dailyAt: z.string().nullable(),
  content: z.number().array(),
  sv: z.number().array(),
});

export const noteUpdateMessageSchema = z.object({
  note: noteUpdateRecord,
  clientId: z.string().min(1),
});

type NoteUpdateMessage = z.infer<typeof noteUpdateMessageSchema>;

export function createNoteUpdateMessage(input: NoteUpdateMessage) {
  return JSON.stringify(noteUpdateMessageSchema.parse(input));
}

export function validateNoteUpdateMessageSchema(input: string) {
  return noteUpdateMessageSchema.safeParse(JSON.parse(input));
}

export const noteUpdateDownstreamMessageSchema = noteUpdateRecord;

export type NoteUpdateDownstreamMessage = z.infer<
  typeof noteUpdateDownstreamMessageSchema
>;

export function createNoteUpdateDownstreamMessage(
  input: NoteUpdateDownstreamMessage,
) {
  return JSON.stringify(noteUpdateDownstreamMessageSchema.parse(input));
}

export function parseNoteUpdateDownstreamMessage(input: string) {
  return noteUpdateDownstreamMessageSchema.safeParse(JSON.parse(input));
}
