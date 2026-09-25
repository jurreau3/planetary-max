import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { asJsonObject } from './contracts';
import type { Bindings, KernelEnvelope, KernelLane } from './contracts';
import { identityEnvelope } from './identity';
import { callKernel } from './kernel-bridge';
import { beeSimEnvelope } from './planetary';
import { governanceEnvelope, umbrellaMode } from './governance';
import { windowsEnvelope } from './types';

// ------------------------------------------------------------
// App + Router
// ------------------------------------------------------------
const app = new Hono<{ Bindings: Bindings }>();
const router = new Hono<{ Bindings: Bindings }>();

app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization'],
}));

// ------------------------------------------------------------
// Root + health
// ------------------------------------------------------------
app.get('/', (c) => {
  return c.json({
    ok: true,
    service: 'planetary-max',
    phase: c.env.PORTAL_OS_PHASE ?? '11',
  });
});

app.get('/health', (c) => c.json({ ok: true, service: 'planetary-max' }));

// ------------------------------------------------------------
// Identity / Umbrella / SIM / Windows
// ------------------------------------------------------------
app.get('/identity', (c) => {
  const token = bearer(c.req.header('Authorization'));
  return c.json(identityEnvelope(token, c.env));
});

app.get('/umbrella', (c) => {
  const mode = umbrellaMode(c.env.UMBRELLA_ENFORCEMENT);
  return c.json({ ok: true, governance: governanceEnvelope(mode) });
});

app.get('/umbrella/mode', (c) => {
  return c.json({ ok: true, mode: umbrellaMode(c.env.UMBRELLA_ENFORCEMENT) });
});

app.get('/sim', (c) => c.json(beeSimEnvelope()));
app.get('/windows', (c) => c.json(windowsEnvelope()));

// ------------------------------------------------------------
// Kernel status + state + umbrella + phase + planetary + version
// ------------------------------------------------------------
router.get('/kernel/status', async (c) => {
  const mode = await planetaryMode(c.env);
  return c.json({
    ok: true,
    service: 'PortalKernel',
    phase: c.env.PORTAL_OS_PHASE ?? '11',
    lane: 'kernel',
    lanes: ['identity', 'windows', 'sim', 'umbrella'],
    status: 'ready',
    tick: 0,
    signals: {},
    kernelMode: mode,
  });
});

router.get('/state/read', (c) => {
  return c.json({
    ok: true,
    service: 'MAXOS_STATE',
    configured: Boolean(c.env.MAXOS_STATE),
    state: {
      identity: { ready: true },
      runtime: { status: 'ready' },
      planetary: { mode: c.env.PLANETARY_MODE ?? 'single' },
      phase: Number(c.env.PORTAL_OS_PHASE ?? '11'),
    },
  });
});

router.get('/umbrella/status', (c) => {
  const mode = umbrellaMode(c.env.UMBRELLA_ENFORCEMENT);
  return c.json({
    ok: true,
    service: 'Umbrella Enforcement',
    mode,
    governance: governanceEnvelope(mode),
    rules: ['identity', 'authorization', 'state-coherence'],
    active: true,
    lastUpdate: Date.now(),
  });
});

router.get('/phase/status', (c) => {
  return c.json({
    ok: true,
    service: 'Portal-OS',
    phase: Number(c.env.PORTAL_OS_PHASE ?? '11'),
    coherence: 1,
    signals: {},
  });
});

router.get('/planetary/mode', async (c) => {
  return c.json({ mode: await planetaryMode(c.env) });
});

router.post('/planetary/toggle', async (c) => {
  const current = await planetaryMode(c.env);
  const next = current === 'active' ? 'single' : 'active';
  if (c.env.MAXOS_STATE) {
    await c.env.MAXOS_STATE.put('planetary:mode', next);
  }
  return c.json({ mode: next });
});

router.get('/version/read', (c) => {
  return c.json({
    ok: true,
    service: 'MAX-OS-1',
    version: c.env.MAX_OS_VERSION ?? '1',
    build: 'portal-os',
    commit: 'unknown',
  });
});

// ------------------------------------------------------------
// Window Manager Introspection (Unified DO)
// ------------------------------------------------------------
router.get('/introspection/windows/state', async (c) => {
  const stub = kernelStub(c.env);
  const res = await stub.fetch(new Request('https://portal/api/windows/state'));
  return c.json(await res.json());
});

router.get('/introspection/windows/focus', async (c) => {
  const stub = kernelStub(c.env);
  const res = await stub.fetch(new Request('https://portal/api/windows/focus'));
  return c.json(await res.json());
});

router.get('/introspection/windows/layout', async (c) => {
  const stub = kernelStub(c.env);
  const res = await stub.fetch(new Request('https://portal/api/windows/layout'));
  return c.json(await res.json());
});

router.get('/introspection/windows/timeline', async (c) => {
  const stub = kernelStub(c.env);
  const res = await stub.fetch(new Request('https://portal/api/windows/timeline'));
  return c.json(await res.json());
});

// ------------------------------------------------------------
// Window Manager Interactive (Unified DO)
// ------------------------------------------------------------
router.post('/windows/open', async (c) => {
  const stub = kernelStub(c.env);
  const body = await c.req.json();
  const res = await stub.fetch(new Request('https://portal/api/windows/open', {
    method: 'POST',
    body: JSON.stringify(body),
  }));
  return c.json(await res.json());
});

router.post('/windows/close', async (c) => {
  const stub = kernelStub(c.env);
  const body = await c.req.json();
  const res = await stub.fetch(new Request('https://portal/api/windows/close', {
    method: 'POST',
    body: JSON.stringify(body),
  }));
  return c.json(await res.json());
});

// ------------------------------------------------------------
// Portal Surface (Unified DO)
// ------------------------------------------------------------
router.post('/portal/open', async (c) => {
  const stub = kernelStub(c.env);
  const body = await c.req.json();
  const res = await stub.fetch(new Request('https://portal/api/portal/open', {
    method: 'POST',
    body: JSON.stringify(body),
  }));
  return c.json(await res.json());
});

router.get('/portal/state', async (c) => {
  const stub = kernelStub(c.env);
  const res = await stub.fetch(new Request('https://portal/api/portal/state'));
  return c.json(await res.json());
});

router.get('/portal/timeline', async (c) => {
  const stub = kernelStub(c.env);
  const res = await stub.fetch(new Request('https://portal/api/portal/timeline'));
  return c.json(await res.json());
});

// ------------------------------------------------------------
// Attach router under /api
// ------------------------------------------------------------
app.route('/api', router);

// ------------------------------------------------------------
// Kernel bridge surfaces
// ------------------------------------------------------------
app.post('/kernel', async (c) => dispatchRequest(c));
app.post('/api/kernel/message', async (c) => dispatchRequest(c));

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
async function planetaryMode(env: Bindings): Promise<string> {
  return (await env.MAXOS_STATE?.get('planetary:mode')) ?? env.PLANETARY_MODE ?? 'single';
}

function kernelStub(env: Bindings) {
  const id = env.PORTAL_KERNEL.idFromName('kernel');
  return env.PORTAL_KERNEL.get(id);
}

async function dispatchRequest(c: any): Promise<Response> {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return error(400, 'INVALID_JSON', 'Request body must be JSON');
  }

  const payload = asJsonObject(body);
  const lane = payload.lane;

  if (!isLane(lane)) {
    return error(400, 'INVALID_LANE', 'lane must be identity, windows, sim, or umbrella');
  }

  const envelope: KernelEnvelope = {
    id: typeof payload.id === 'string' ? payload.id : crypto.randomUUID(),
    lane,
    payload,
    identity: bearer(c.req.header('Authorization')) ?? 'anonymous',
  };

  try {
    return await callKernel(c.env, envelope);
  } catch {
    return error(503, 'KERNEL_UNAVAILABLE', 'PortalKernel is unavailable');
  }
}

function isLane(value: unknown): value is KernelLane {
  return value === 'identity' || value === 'windows' || value === 'sim' || value === 'umbrella';
}

function bearer(value: string | undefined): string | undefined {
  return value?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
}

function error(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

// ------------------------------------------------------------
// Durable Object Exports
// ------------------------------------------------------------
export * from './do';

// ------------------------------------------------------------
// FINAL — Worker fetch
// ------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/kernel' || url.pathname.startsWith('/kernel/')) {
      const id = env.PORTAL_KERNEL.idFromName('kernel');
      const stub = env.PORTAL_KERNEL.get(id);
      return stub.fetch(request);
    }

    return app.fetch(request, env, ctx);
  },
};
