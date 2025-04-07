export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const response = Response.json({
        name: "Cloudflare",
      });
      return response;
    }

    return new Response(null, { status: 404 });
  },
} satisfies ExportedHandler<Cloudflare.Env>;
