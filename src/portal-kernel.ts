import type { Bindings, KernelEnvelope, KernelResult } from './contracts';
import { allowEnvelope, umbrellaMode } from './governance';
import { asJsonObject } from './contracts';

// ------------------------------------------------------------
// PortalKernel Durable Object — Max‑OS Interactive Edition
// ------------------------------------------------------------
export class PortalKernel {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Pick<Bindings, 'PORTAL_OS_PHASE' | 'UMBRELLA_ENFORCEMENT'>
  ) {}

  // ------------------------------------------------------------
  // MAX‑OS Interactive State
  // ------------------------------------------------------------
  private interactive = {
    windows: [] as Array<{
      id: string;
      title: string;
      kind: string;
      active: boolean;
      openedAt: number;
      z: number;
    }>,

    focusHistory: [] as Array<{ id: string; at: number }>,

    layout: [] as Array<{ id: string; x: number; y: number; w: number; h: number }>,

    windowTimeline: [] as Array<{ type: string; id: string; at: number }>,

    portal: {
      open: false,
      surface: null as string | null,
      timeline: [] as Array<{ type: string; surface: string; at: number }>
    }
  };

  // ------------------------------------------------------------
  // Durable Object fetch handler
  // ------------------------------------------------------------
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // ------------------------------
    // Interactive Window Manager API
    // ------------------------------
    if (url.pathname === '/api/windows/state') {
      return Response.json(await this.getWindowManagerState());
    }

    if (url.pathname === '/api/windows/focus') {
      return Response.json(await this.getWindowFocusState());
    }

    if (url.pathname === '/api/windows/layout') {
      return Response.json(await this.getWindowLayout());
    }

    if (url.pathname === '/api/windows/timeline') {
      return Response.json(await this.getWindowTimeline());
    }

    if (url.pathname === '/api/windows/open' && request.method === 'POST') {
      const body = await request.json();
      return Response.json(await this.openWindow(body));
    }

    if (url.pathname === '/api/windows/close' && request.method === 'POST') {
      const body = await request.json();
      return Response.json(await this.closeWindow(body));
    }

    // ------------------------------
    // Interactive Portal Surface API
    // ------------------------------
    if (url.pathname === '/api/portal/open' && request.method === 'POST') {
      const body = await request.json();
      return Response.json(await this.openPortal(body));
    }

    if (url.pathname === '/api/portal/state') {
      return Response.json(await this.getPortalState());
    }

    if (url.pathname === '/api/portal/timeline') {
      return Response.json(await this.getPortalTimeline());
    }

    // ------------------------------
    // Kernel Envelope API (existing)
    // ------------------------------
    if (request.method !== 'POST' || url.pathname !== '/api/kernel/message') {
      return Response.json({
        ok: true,
        service: 'PortalKernel',
        phase: this.env.PORTAL_OS_PHASE ?? '11'
      });
    }

    let value: unknown;
    try {
      value = await request.json();
    } catch {
      return Response.json(
        { ok: false, error: { code: 'INVALID_JSON', message: 'Kernel envelope must be JSON' } },
        { status: 400 }
      );
    }

    if (!isEnvelope(value)) {
      return Response.json(
        { ok: false, error: { code: 'INVALID_ENVELOPE', message: 'Stable kernel envelope required' } },
        { status: 400 }
      );
    }

    const mode = umbrellaMode(this.env.UMBRELLA_ENFORCEMENT);
    if (!allowEnvelope(value.lane, mode)) {
      return Response.json(
        { ok: false, error: { code: 'FORBIDDEN', message: 'Envelope denied by umbrella governance' } },
        { status: 403 }
      );
    }

    const data = await dispatch(value, this.state.storage);
    const result: KernelResult = {
      ok: true,
      lane: value.lane,
      data,
      meta: { id: value.id, phase: '11' }
    };

    return Response.json(result);
  }

  // ------------------------------------------------------------
  // Window Manager Methods
  // ------------------------------------------------------------
  async getWindowManagerState() {
    return {
      windows: this.interactive.windows,
      focusHistory: this.interactive.focusHistory,
      layout: this.interactive.layout
    };
  }

  async getWindowFocusState() {
    const active = this.interactive.windows.find(w => w.active);
    return {
      activeWindow: active || null,
      focusHistory: this.interactive.focusHistory
    };
  }

  async getWindowLayout() {
    return this.interactive.layout;
  }

  async getWindowTimeline() {
    return this.interactive.windowTimeline;
  }

  async openWindow({ id, title, kind }: { id: string; title?: string; kind?: string }) {
    const now = Date.now();

    this.interactive.windows.forEach(w => (w.active = false));

    const win = {
      id,
      title: title ?? id,
      kind: kind ?? 'generic',
      active: true,
      openedAt: now,
      z: this.interactive.windows.length + 1
    };

    this.interactive.windows.push(win);
    this.interactive.focusHistory.push({ id, at: now });
    this.interactive.windowTimeline.push({ type: 'open', id, at: now });

    return { ok: true, window: win };
  }

  async closeWindow({ id }: { id: string }) {
    const now = Date.now();

    this.interactive.windows = this.interactive.windows.filter(w => w.id !== id);
    this.interactive.windowTimeline.push({ type: 'close', id, at: now });

    const last = this.interactive.windows[this.interactive.windows.length - 1];
    if (last) {
      last.active = true;
      this.interactive.focusHistory.push({ id: last.id, at: now });
    }

    return { ok: true };
  }

  // ------------------------------------------------------------
  // Portal Surface Methods
  // ------------------------------------------------------------
  async openPortal({ surface }: { surface: string }) {
    const now = Date.now();
    this.interactive.portal.open = true;
    this.interactive.portal.surface = surface;
    this.interactive.portal.timeline.push({ type: 'open', surface, at: now });

    return { ok: true, portal: this.interactive.portal };
  }

  async getPortalState() {
    return this.interactive.portal;
  }

  async getPortalTimeline() {
    return this.interactive.portal.timeline;
  }
}

// ------------------------------------------------------------
// Existing kernel dispatch logic (rewritten)
// ------------------------------------------------------------
async function dispatch(envelope: KernelEnvelope, storage: DurableObjectStorage): Promise<Record<string, unknown>> {
  switch (envelope.lane) {
    case 'identity':
      return { surface: 'identity', authenticated: envelope.identity !== 'anonymous' };

    case 'windows':
      return { surface: 'windows', windows: [] };

    case 'sim':
      await storage.put('sim:last', envelope.payload);
      return { surface: 'sim', placeholder: true, accepted: true };

    case 'umbrella':
      return { surface: 'umbrella', accepted: true, policy: 'strict' };
  }
}

function isEnvelope(value: unknown): value is KernelEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.lane === 'string' &&
    ['identity', 'windows', 'sim', 'umbrella'].includes(candidate.lane) &&
    typeof candidate.identity === 'string' &&
    typeof candidate.payload === 'object' &&
    candidate.payload !== null
  );
}

export default PortalKernel;
