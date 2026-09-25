// ------------------------------------------------------------
// FINAL — ONLY ONE DEFAULT EXPORT
// ------------------------------------------------------------

// Cloudflare Durable Object Exports (required)
export * from './do';

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === "/kernel" || url.pathname.startsWith("/kernel/")) {
      const id = env.PORTAL_KERNEL.idFromName("kernel");
      const stub = env.PORTAL_KERNEL.get(id);
      return stub.fetch(request);
    }

    return app.fetch(request, env, ctx);
  }
};

