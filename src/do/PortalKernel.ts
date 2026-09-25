export class PortalKernel {
  constructor(state, env) {
    this.state = state;
    this.env = env;

    // Ensure kernel state is initialized before any requests are handled
    this.state.blockConcurrencyWhile(async () => {
      const stored = (await this.state.storage.get("kernel")) ?? {};
      this.kernel = normalize(stored);
    });
  }

  async fetch(request) {
    const url = new URL(request.url);
    const path = url.pathname;

    // Always work against in-memory kernel; persist only after mutations
    const kernel = this.kernel ?? normalize({});

    // -----------------------------
    // WINDOWS — INTROSPECTION
    // -----------------------------
    if (path === "/api/windows/state") {
      return Response.json({ ok: true, windows: kernel.windows });
    }

    if (path === "/api/windows/focus") {
      return Response.json({ ok: true, focus: kernel.windows.focus });
    }

    if (path === "/api/windows/layout") {
      return Response.json({ ok: true, layout: kernel.windows.layout });
    }

    if (path === "/api/windows/timeline") {
      return Response.json({ ok: true, timeline: kernel.timeline });
    }

    // -----------------------------
    // WINDOWS — INTERACTIVE
    // -----------------------------
    if (path === "/api/windows/open" && request.method === "POST") {
      const body = await safeJson(request);
      const id = body.id ?? crypto.randomUUID();
      const type = body.type ?? "window";
      const payload = body.payload ?? {};

      const entry = { id, type, payload, openedAt: Date.now() };

      kernel.windows.layout.push(entry);
      kernel.windows.focus = id;

      kernel.timeline.push({
        lane: "windows",
        event: "open",
        id,
        ts: Date.now(),
        payload
      });

      await this.persist(kernel);
      return Response.json({ ok: true, windows: kernel.windows });
    }

    if (path === "/api/windows/close" && request.method === "POST") {
      const body = await safeJson(request);
      const id = body.id;

      if (!id) {
        return Response.json(
          { ok: false, error: { code: "MISSING_ID", message: "id is required" } },
          { status: 400 }
        );
      }

      kernel.windows.layout = kernel.windows.layout.filter(w => w.id !== id);

      if (kernel.windows.focus === id) {
        kernel.windows.focus = kernel.windows.layout.at(-1)?.id ?? null;
      }

      kernel.timeline.push({
        lane: "windows",
        event: "close",
        id,
        ts: Date.now()
      });

      await this.persist(kernel);
      return Response.json({ ok: true, windows: kernel.windows });
    }

    // -----------------------------
    // PORTAL SURFACE
    // -----------------------------
    if (path === "/api/portal/open" && request.method === "POST") {
      const body = await safeJson(request);
      const id = body.id ?? crypto.randomUUID();
      const payload = body.payload ?? {};

      const entry = { id, payload, openedAt: Date.now() };

      kernel.portal.state[id] = entry;
      kernel.portal.timeline.push({ id, ts: Date.now(), payload });

      kernel.timeline.push({
        lane: "portal",
        event: "open",
        id,
        ts: Date.now(),
        payload
      });

      await this.persist(kernel);
      return Response.json({ ok: true, portal: kernel.portal });
    }

    if (path === "/api/portal/state") {
      return Response.json({ ok: true, portal: kernel.portal.state });
    }

    if (path === "/api/portal/timeline") {
      return Response.json({ ok: true, timeline: kernel.portal.timeline });
    }

    // -----------------------------
    // DEFAULT — KERNEL STATUS
    // -----------------------------
    return Response.json({
      ok: true,
      service: "PortalKernel",
      phase: this.env.PORTAL_OS_PHASE ?? "11",
      windows: kernel.windows,
      portal: kernel.portal,
      timeline: kernel.timeline
    });
  }

  async persist(kernel) {
    this.kernel = normalize(kernel);
    await this.state.storage.put("kernel", this.kernel);
  }
}

async function safeJson(request) {
  try {
    const body = await request.json();
    return typeof body === "object" && body !== null ? body : {};
  } catch {
    return {};
  }
}

function normalize(stored) {
  const windows = stored?.windows ?? {};
  const portal = stored?.portal ?? {};

  return {
    windows: {
      layout: Array.isArray(windows.layout) ? windows.layout : [],
      focus: windows.focus ?? null
    },
    portal: {
      state: typeof portal.state === "object" && portal.state !== null ? portal.state : {},
      timeline: Array.isArray(portal.timeline) ? portal.timeline : []
    },
    timeline: Array.isArray(stored?.timeline) ? stored.timeline : []
  };
}
