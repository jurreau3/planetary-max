import { Hono } from 'hono';
import { cors } from 'hono/cors';
import type { Bindings, KernelEnvelope, KernelLane } from './contracts';
import { asJsonObject } from './contracts';
import { identityEnvelope } from './identity';
import { callKernel } from './kernel-bridge';
import { beeSimEnvelope } from './planetary';
import { governanceEnvelope, umbrellaMode } from './governance';
import { windowsEnvelope } from './types';

const app = new Hono<{ Bindings: Bindings }>();
const router = new Hono<{ Bindings: Bindings }>();
const PLANETARY_MODE_KEY = 'planetary:mode';

app.use(
  '*',
  cors({
    origin: '*',
    allowMethods: ['GET', 'POST', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }),
);

// ------------------------------------------------------------
// Root + health
// ------------------------------------------------------------
app.get('/', (c) =>
  c.json({ ok: true, service: 'planetary-max', phase: c.env.PORTAL_OS_PHASE ?? '11' }),
);
app.get('/health', (c) => c.json({ ok: true, service: 'planetary-max' }));

// ------------------------------------------------------------
// Identity / Umbrella / SIM / Windows
// ------------------------------------------------------------
app.get('/identity', (c) =>
  c.json(identityEnvelope(bearer(c.req.header('Authorization')), c.env)),
);

app.get('/umbrella', (c) =>
  c.json({
    ok: true,
    governance: governanceEnvelope(umbrellaMode(c.env.UMBRELLA_ENFORCEMENT)),
  }),
);

app.get('/umbrella/mode', (c) =>
  c.json({ ok: true, mode: umbrellaMode(c.env.UMBRELLA_ENFORCEMENT) }),
);

app.get('/sim', (c) => c.json(beeSimEnvelope()));
app.get('/windows', (c) => c.json(windowsEnvelope()));

// ------------------------------------------------------------
// Kernel / state / umbrella / phase / planetary / version
// ------------------------------------------------------------
router.get('/kernel/status', (c) =>
  c.json({
    ok: true,
    service: 'PortalKernel',
    phase: c.env.PORTAL_OS_PHASE ?? '11',
    lane: 'kernel',
    lanes: ['identity', 'windows', 'sim', 'umbrella'],
    status: 'ready',
    tick: 0,
    signals: {},
    kernelMode: (async () => await planetaryMode(c.env))(),
  }),
);

router.get('/state/read', (c) =>
  c.json({
    ok: true,
    service: 'MAXOS_STATE',
    configured: Boolean(c.env.MAXOS_STATE),
    state: {
      identity: { ready: true },
      runtime: { status: 'ready' },
      planetary: { mode: c.env.PLANETARY_MODE ?? 'single' },
      phase: Number(c.env.PORTAL_OS_PHASE ?? '11'),
    },
  }),
);

router.get('/umbrella/status', (c) =>
  c.json({
    ok: true,
    service: 'Umbrella Enforcement',
    mode: umbrellaMode(c.env.UMBRELLA_ENFORCEMENT),
    governance: governanceEnvelope(umbrellaMode(c.env.UMBRELLA_ENFORCEMENT)),
    rules: ['identity', 'authorization', 'state-coherence'],
    active: true,
    lastUpdate: Date.now(),
  }),
);

router.get('/phase/status', (c) =>
  c.json({
    ok: true,
    service: 'Portal-OS',
    phase: Number(c.env.PORTAL_OS_PHASE ?? '11'),
    coherence: 1,
    signals: {},
  }),
);

router.get('/planetary/mode', async (c) =>
  c.json({ mode: await planetaryMode(c.env) }),
);

router.post('/planetary/toggle', async (c) => {
  const mode = (await planetaryMode(c.env)) === 'active' ? 'single' : 'active';
  if (c.env.MAXOS_STATE) await c.env.MAXOS_STATE.put(PLANETARY_MODE_KEY, mode);
  return c.json({ mode });
});

router.get('/version/read', (c) =>
  c.json({
    ok: true,
    service: 'MAX-OS-1',
    version: c.env.MAX_OS_VERSION ?? '1',
    build: 'portal-os',
    commit: 'unknown',
  }),
);

// ------------------------------------------------------------
// MAX-OS Window Manager Introspection API (Unified DO)
// ------------------------------------------------------------
router.get('/introspection/windows/state', async (c) => {
  const kernel = c.env.PORTAL_KERNEL.get(c.env.PORTAL_KERNEL.idFromName('kernel'));
  const result = await kernel.fetch(new Request('https://portal/api/windows/state'));
  return c.json(await result.json());
});

router.get('/introspection/windows/focus', async (c) => {
  const kernel = c.env.PORTAL_KERNEL.get(c.env.PORTAL_KERNEL.idFromName('kernel'));
  const result = await kernel.fetch(new Request('https://portal/api/windows/focus'));
  return c.json(await result.json());
});

router.get('/introspection/windows/layout', async (c) => {
  const kernel = c.env.PORTAL_KERNEL.get(c.env.PORTAL_KERNEL.idFromName('kernel'));
  const result = await kernel.fetch(new Request('https://portal/api/windows/layout'));
  return c.json(await result.json());
});

router.get('/introspection/windows/timeline', async (c) => {
  const kernel = c.env.PORTAL_KERNEL.get(c.env.PORTAL_KERNEL.idFromName('kernel'));
  const result = await kernel.fetch(new Request('https://portal/api/windows/timeline'));
  return c.json(await result.json());
});

// ------------------------------------------------------------
// MAX-OS Window Manager Interactive API (Unified DO)
// ------------------------------------------------------------
router.post('/windows/open', async (c) => {
  const kernel = c.env.PORTAL_KERNEL.get(c.env.PORTAL_KERNEL.idFromName('kernel'));
  const body = await c.req.json();
  const result = await kernel.fetch(
    new Request('https://portal/api/windows/open', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
  return c.json(await result.json());
});

router.post('/windows/close', async (c) => {
  const kernel = c.env.PORTAL_KERNEL.get(c.env.PORTAL_KERNEL.idFromName('kernel'));
  const body = await c.req.json();
  const result = await kernel.fetch(
    new Request('https://portal/api/windows/close', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
  return c.json(await result.json());
});

// ------------------------------------------------------------
// MAX-OS Portal Surface API (Unified DO)
// ------------------------------------------------------------
router.post('/portal/open', async (c) => {
  const kernel = c.env.PORTAL_KERNEL.get(c.env.PORTAL_KERNEL.idFromName('kernel'));
  const body = await c.req.json();
  const result = await kernel.fetch(
    new Request('https://portal/api/portal/open', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  );
  return c.json(await result.json());
});

router.get('/portal/state', async (c) => {
  const kernel = c.env.PORTAL_KERNEL.get(c.env.PORTAL_KERNEL.idFromName('kernel'));
  const result = await kernel.fetch(new Request('https://portal/api/portal/state'));
  return c.json(await result.json());
});

router.get('/portal/timeline', async (c) => {
  const kernel = c.env.PORTAL_KERNEL.get(c.env.PORTAL_KERNEL.idFromName('kernel'));
  const result = await kernel.fetch(new Request('https://portal/api/portal/timeline'));
  return c.json(await result.json());
});

// ------------------------------------------------------------
// Attach router under /api
// ------------------------------------------------------------
app.route('/api', router);

// ------------------------------------------------------------
// Kernel bridge surfaces (static)
// ------------------------------------------------------------


app.post('/kernel', async (c) => dispatchRequest(c));
app.post('/api/kernel/message', async (c) => dispatchRequest(c));

// ------------------------------------------------------------
// Helpers
// ------------------------------------------------------------
async function planetaryMode(env: Bindings): Promise<string> {
  return (await env.MAXOS_STATE?.get(PLANETARY_MODE_KEY)) ?? env.PLANETARY_MODE ?? 'single';
}

async function dispatchRequest(c: {
  req: { header(name: string): string | undefined; json(): Promise<unknown> };
  env: Bindings;
}): Promise<Response> {
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
// REQUIRED Durable Object Exports
// ------------------------------------------------------------
export { PortalKernel } from './do/PortalKernel';
export { new_sqlite_classes } from './do/new_sqlite_classes';

// ------------------------------------------------------------
// FINAL — ONLY ONE DEFAULT EXPORT
// ------------------------------------------------------------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Intercept ALL /kernel traffic before Hono sees it
    if (url.pathname === "/kernel" || url.pathname.startsWith("/kernel/")) {
      const id = env.PORTAL_KERNEL.idFromName("portal-kernel");
      const stub = env.PORTAL_KERNEL.get(id);
      return stub.fetch(request);
    }

    // Everything else → Hono
    return app.fetch(request, env, ctx);
  }
};

