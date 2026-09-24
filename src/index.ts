import { Hono } from 'hono';
import type { Bindings, KernelEnvelope, KernelLane, JsonObject } from './contracts';
import { asJsonObject } from './contracts';
import { identityEnvelope } from './identity';
import { callKernel } from './kernel-bridge';
import { beeSimEnvelope } from './planetary';
import { governanceEnvelope, umbrellaMode } from './governance';
import { windowsEnvelope } from './types';

const app = new Hono<{ Bindings: Bindings }>();

app.get('/', (c) => c.json({ ok: true, service: 'planetary-max', phase: c.env.PORTAL_OS_PHASE ?? '11' }));
app.get('/health', (c) => c.json({ ok: true, service: 'planetary-max' }));
app.get('/identity', (c) => c.json(identityEnvelope(bearer(c.req.header('Authorization')), c.env)));
app.get('/umbrella', (c) => c.json({ ok: true, governance: governanceEnvelope(umbrellaMode(c.env.UMBRELLA_ENFORCEMENT)) }));
app.get('/umbrella/mode', (c) => c.json({ ok: true, mode: umbrellaMode(c.env.UMBRELLA_ENFORCEMENT) }));
app.get('/sim', (c) => c.json(beeSimEnvelope()));
app.get('/windows', (c) => c.json(windowsEnvelope()));

app.get('/kernel', (c) => c.json({ ok: true, lane: 'kernel', lanes: ['identity', 'windows', 'sim', 'umbrella'] }));
app.post('/kernel', async (c) => dispatchRequest(c));
app.post('/api/kernel/message', async (c) => dispatchRequest(c));

async function dispatchRequest(c: { req: { header(name: string): string | undefined; json(): Promise<unknown> }; env: Bindings }): Promise<Response> {
  let body: unknown;
  try { body = await c.req.json(); } catch { return error(400, 'INVALID_JSON', 'Request body must be JSON'); }
  const payload = asJsonObject(body);
  const lane = payload.lane;
  if (!isLane(lane)) return error(400, 'INVALID_LANE', 'lane must be identity, windows, sim, or umbrella');
  const envelope: KernelEnvelope = {
    id: typeof payload.id === 'string' ? payload.id : crypto.randomUUID(),
    lane,
    payload,
    identity: bearer(c.req.header('Authorization')) ?? 'anonymous',
  };
  try { return await callKernel(c.env, envelope); } catch { return error(503, 'KERNEL_UNAVAILABLE', 'PortalKernel is unavailable'); }
}

function isLane(value: unknown): value is KernelLane { return value === 'identity' || value === 'windows' || value === 'sim' || value === 'umbrella'; }
function bearer(value: string | undefined): string | undefined { return value?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim(); }
function error(status: number, code: string, message: string): Response { return Response.json({ ok: false, error: { code, message } }, { status }); }

export { app };
export { PortalKernel } from './do/PortalKernel';
export { new_sqlite_classes } from './do/new_sqlite_classes';
export default app;
