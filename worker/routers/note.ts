import { protectedProcedure, router } from "../lib/trpc";
import { z } from "zod";
import { env } from "cloudflare:workers";

const vectorClockSchema = z.record(z.string(), z.number());

const noteInputSchema = z.object({
  id: z.string(),
  oldVectorClock: vectorClockSchema,
  newVectorClock: vectorClockSchema,
  daily_at: z.string().nullable(),
  content: z.number().array(),
  sv: z.number().array(),
});

export type NoteInput = z.infer<typeof noteInputSchema>;

const localMetadataSchema = z.array(
  z.object({
    id: z.string(),
    vectorClock: z.record(z.string(), z.number()),
  }),
);

export type LocalMetadata = z.infer<typeof localMetadataSchema>;

export const noteRouter = router({
  // Server route
  getSyncPlan: protectedProcedure
    .input(
      z.object({
        localMetadata: localMetadataSchema,
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const id = env.GRAPH_DO.idFromName(ctx.session.user.id);
      const stub = env.GRAPH_DO.get(id);

      return await stub.getSyncPlan(input);
    }),

  save: protectedProcedure
    .input(z.object({ notes: noteInputSchema.array(), clientId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const id = env.GRAPH_DO.idFromName(ctx.session.user.id);
      const stub = env.GRAPH_DO.get(id);

      return stub.save(input);
    }),

  purge: protectedProcedure.mutation(async ({ ctx }) => {
    const id = env.GRAPH_DO.idFromName(ctx.session.user.id);
    const stub = env.GRAPH_DO.get(id);

    return stub.purge();
  }),
});
