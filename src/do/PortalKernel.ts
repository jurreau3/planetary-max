// src/do/PortalKernel.ts

export class PortalKernel {
  state: DurableObjectState;
  env: any;

  constructor(state: DurableObjectState, env: any) {
    this.state = state;
    this.env = env;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname.replace(/^https?:\/\/[^/]+/, '');

    // Load current kernel state (windows + portal + timeline)
    const stored = (await this.state.storage.get('kernel')) ?? {};
    const kernel = normalizeKernelState(stored);

    // Route by path
    if (path === '/api/windows/state') {
      return Response.json({ ok: true, windows: kernel.windows });
    }

    if (path === '/api/windows/focus') {
      return Response.json({ ok: true, focus: kernel.windows.focus ?? null });
    }

    if (path === '/api/windows/layout') {
      return Response.json({ ok: true, layout: kernel.windows.layout ?? [] });
    }

    if (path === '/api/windows/timeline') {
      return Response.json({ ok: true, timeline: kernel.timeline });
    }

    if (path === '/api/windows/open' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const id = body.id ?? crypto.randomUUID();
      const type = body.type ?? 'window';
      const payload = body.payload ?? {};

      const entry = { id, type, payload, openedAt: Date.now() };
      kernel.windows.layout.push(entry);
      kernel.windows.focus = id;
      kernel.timeline.push({ lane: 'windows', event: 'open', id, ts: Date.now(), payload });

      await this.state.storage.put('kernel', kernel);
      return Response.json({ ok: true, windows: kernel.windows });
    }

    if (path === '/api/windows/close' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const id = body.id;

      if (!id) {
        return Response.json(
          { ok: false, error: { code: 'MISSING_ID', message: 'id is required' } },
          { status: 400 },
        );
      }

      kernel.windows.layout = kernel.windows.layout.filter((w: any) => w.id !== id);
      if (kernel.windows.focus === id) {
        kernel.windows.focus = kernel.windows.layout.at(-1)?.id ?? null;
      }
      kernel.timeline.push({ lane: 'windows', event: 'close', id, ts: Date.now() });

      await this.state.storage.put('kernel', kernel);
      return Response.json({ ok: true, windows: kernel.windows });
    }

    // Portal surface
    if (path === '/api/portal/open' && request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      const id = body.id ?? crypto.randomUUID();
      const payload = body.payload ?? {};

      const entry = { id, payload, openedAt: Date.now() };
      kernel.portal.state[id] = entry;
      kernel.portal.timeline.push({ id, ts: Date.now(), payload });
      kernel.timeline.push({ lane: 'portal', event: 'open', id, ts: Date.now(), payload });

      await this.state.storage.put('kernel', kernel);
      return Response.json({ ok: true, portal: kernel.portal });
    }

    if (path === '/api/portal/state') {
      return Response.json({ ok: true, portal: kernel.portal.state });
    }

    if (path === '/api/portal/timeline') {
      return Response.json({ ok: true, timeline: kernel.portal.timeline });
    }

    // Fallback: kernel status
    return Response.json({
      ok: true,
      service: 'PortalKernel',
      phase: this.env.PORTAL_OS_PHASE ?? '11',
      lanes: ['identity', 'windows', 'sim', 'umbrella'],
      windows: kernel.windows,
      portal: kernel.portal,
      timeline: kernel.timeline,
    });
  }
}

function normalizeKernelState(stored: any) {
  return {
    windows: {
      layout: stored?.windows?.layout ?? [],
      focus: stored?.windows?.focus ?? null,
    },
    portal: {
      state: stored?.portal?.state ?? {},
      timeline: stored?.portal?.timeline ?? [],
    },
    timeline: stored?.timeline ?? [],
  };
}
