export { GraphSyncDurableObject } from "./graph-sync/durable-object";

export default {
  fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({ ok: true });
    }

    const syncMatch = url.pathname.match(/^\/api\/sync\/([^/]+)(\/.*)?$/);
    if (syncMatch) {
      const graphName = syncMatch[1];
      const restPath = syncMatch[2] ?? "/";

      if (!graphName) {
        return Response.json(
          { error: "Graph name is required" },
          { status: 400 },
        );
      }

      const durableObject = env.GRAPH_SYNC_DO.getByName(graphName);
      const durableObjectUrl = new URL(request.url);

      durableObjectUrl.pathname = restPath;

      return durableObject.fetch(new Request(durableObjectUrl, request));
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json({ error: "Not found" }, { status: 404 });
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
