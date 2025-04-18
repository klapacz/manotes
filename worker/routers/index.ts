import { protectedProcedure, publicProcedure, router } from "../lib/trpc";
import { noteRouter } from "./note";

export const appRouter = router({
  healthCheck: publicProcedure.query(() => {
    return "OK";
  }),
  privateData: protectedProcedure.query(({ ctx }) => {
    return {
      message: "This is private",
      user: ctx.session.user,
    };
  }),
  note: noteRouter,
});

export type AppRouter = typeof appRouter;
