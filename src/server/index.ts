import { Hono, type Context } from "hono";
import { GraphRegistryDurableObject } from "./graph-registry/durable-object";
import { GraphSyncDurableObject } from "./graph-sync/durable-object";

export { GraphSyncDurableObject, GraphRegistryDurableObject };

const app = new Hono<{ Bindings: Env }>();

app.get("/api/health", (c) => c.json({ ok: true }));

app.all("/api/graphs", (c) => proxyToGraphRegistry(c.req.raw, c.env));
app.all("/api/graphs/:graphId", (c) => proxyToGraphRegistry(c.req.raw, c.env));

app.all("/api/sync/:graphId", (c) =>
  proxyToGraphSync({
    context: c,
    graphId: c.req.param("graphId"),
    pathname: "/",
  }),
);
app.all("/api/sync/:graphId/health", (c) =>
  proxyToGraphSync({
    context: c,
    graphId: c.req.param("graphId"),
    pathname: "/health",
  }),
);

app.all("/api/*", (c) => c.json({ error: "Not found" }, 404));
app.all("*", () => new Response(null, { status: 404 }));

export default app;

async function proxyToGraphRegistry(request: Request, env: Env) {
  const registry = env.GRAPH_REGISTRY_DO.getByName(env.ACCOUNT_ID);
  return registry.fetch(request);
}

async function proxyToGraphSync({
  context,
  graphId,
  pathname,
}: {
  context: Context<{ Bindings: Env }>;
  graphId: string;
  pathname: string;
}) {
  const registry = context.env.GRAPH_REGISTRY_DO.getByName(
    context.env.ACCOUNT_ID,
  );
  const exists = await registry.graphExists(graphId).catch(() => null);

  if (exists === false) {
    return context.json({ error: "Not found" }, { status: 404 });
  }

  if (exists === null) {
    return context.json(
      { error: "Failed to authorize graph" },
      { status: 500 },
    );
  }

  const durableObject = context.env.GRAPH_SYNC_DO.getByName(graphId);
  const durableObjectUrl = new URL(context.req.raw.url);

  durableObjectUrl.pathname = pathname;

  return durableObject.fetch(new Request(durableObjectUrl, context.req.raw));
}
