import { trpcServer } from "@hono/trpc-server";
import { Hono } from "hono";
import { logger } from "hono/logger";
import { auth } from "./lib/auth";
import { createContext } from "./lib/context";
import { appRouter } from "./routers/index";
import { phClient } from "./lib/posthog";

const app = new Hono<{
  Bindings: Cloudflare.Env;
}>();

app.use(async (ctx, next) => {
  await next();
  ctx.executionCtx.waitUntil(phClient.shutdown());
});

app.use(logger());

// app.use(
//   "/*",
//   cors({
//     origin: process.env.CORS_ORIGIN || "",
//     allowMethods: ["GET", "POST", "OPTIONS"],
//     allowHeaders: ["Content-Type", "Authorization"],
//     credentials: true,
//   }),
// );

app.on(["POST", "GET"], "/api/auth/**", (c) => auth.handler(c.req.raw));

app.use(
  "/trpc/*",
  trpcServer({
    router: appRouter,
    createContext: (_opts, context) => {
      return createContext({ context });
    },
    onError: (opts) => {
      console.error(opts.error);
    },
  }),
);

app.get("/ws", async (c) => {
  if (c.req.header("upgrade") !== "websocket") {
    return c.text("Expected Upgrade: websocket", 426);
  }

  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
  });

  if (!session) {
    return c.text("Unauthorized", 401);
  }

  const id = c.env.GRAPH_DO.idFromName(session.user.id);
  const stub = c.env.GRAPH_DO.get(id);

  return stub.fetch(c.req.raw);
});

export default app;

export type { AppRouter } from "./routers/index";

export { GraphDurableObject } from "./do/graph";
