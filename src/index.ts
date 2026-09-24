import { Hono } from 'hono';
import { cors } from 'hono/cors';

import type { Bindings, KernelEnvelope, KernelResult } from './contracts';
import { isRecord } from './contracts';
import { callKernel } from './kernel-bridge';
import { KernelEngine } from './kernel-engine';

type UmbrellaOperation =
  | 'identity.physics.license'
  | 'governance.engine.license'
  | 'apex.alignment.advisory'
  | 'umbrella.sim.pack'
  | 'umbrella.market.forecast'
  | 'umbrella.identity.mirror'
  | 'umbrella.crossworld.access'
  | 'structural.truth.license';

const app = new Hono<{ Bindings: Bindings }>();

app.use(
  '*',
  cors({
    origin: '*',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['GET', 'POST', 'OPTIONS'],
  }),
);

app.get('/', (c) =>
  c.json({
    status: 'Portal‑OS live',
    worker: 'planetary-max',
    mode: c.env.PLANETARY_MODE,
    umbrella: c.env.UMBRELLA_ENFORCEMENT,
  }),
);

app.get('/health', (context) => context.json({ status: 'ok', service: 'planetary-max' }));

app.post('/api/kernel/message', async (c) => {
  const identity = bearerToken(c.req.header('Authorization'));
  if (!identity) return unauthenticatedResponse();

  let body: unknown;
  try {
    body = await context.req.json();
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Request body must be JSON');
  }

  if (!isRecord(body) || typeof body.type !== 'string') {
    return errorResponse(400, 'INVALID_MESSAGE', 'type and object payload are required');
  }
  const payload = body.payload === undefined ? {} : body.payload;
  if (!isRecord(payload)) {
    return errorResponse(400, 'INVALID_MESSAGE', 'type and object payload are required');
  }

  const envelope = createEnvelope(
    body.type,
    payload,
    identity,
    isJsonObject(body.governanceContext) ? body.governanceContext : {},
    typeof body.id === 'string' && body.id.trim() !== '' ? body.id : undefined,
  );
  return kernelResponse(c.env, envelope);
});

app.post('/os/kernel/message', async (context) => {
  const identity = bearerToken(context.req.header('Authorization'));
  if (!identity) return unauthenticated();

const umbrellaRoutes: Array<[string, UmbrellaOperation]> = [
  ['/umbrella/identity/license', 'identity.physics.license'],
  ['/umbrella/governance/license', 'governance.engine.license'],
  ['/umbrella/apex/advisory', 'apex.alignment.advisory'],
  ['/umbrella/sim/pack', 'umbrella.sim.pack'],
  ['/umbrella/market/forecast', 'umbrella.market.forecast'],
  ['/umbrella/identity/mirror', 'umbrella.identity.mirror'],
  ['/umbrella/crossworld/access', 'umbrella.crossworld.access'],
  ['/umbrella/structural/truth/license', 'structural.truth.license'],
];

for (const [path, type] of umbrellaRoutes) {
  app.post(path, async (c) =>
    umbrellaRequest(c.env, c.req.header('Authorization'), c.req.raw, type),
  );
}

app.post('/universe/tick', async (context) => {
  let payload: JsonObject = {};
  const contentType = context.req.header('Content-Type') ?? '';
  if (contentType.includes('application/json')) {
    let body: unknown;
    try {
      const body: unknown = await c.req.json();
      if (!isRecord(body)) {
        return errorResponse(400, 'INVALID_JSON', 'Tick payload must be an object');
      }
      payload = body;
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Request body must be JSON');
    }
    if (!isJsonObject(body)) return invalidJson('Tick payload must be an object');
    payload = body;
  }
  return normalizedRequest(context.env, context.req.header('Authorization'), 'universe.tick', payload);
});

async function normalizedRequest(
  env: Bindings,
  authorization: string | undefined,
  type: string,
  payload: JsonObject,
): Promise<Response> {
  const identity = bearerToken(authorization);
  if (!identity) return unauthenticatedResponse();
  return kernelResponse(env, createEnvelope(type, payload, identity, { surface: 'worker-api' }), true);
}

async function umbrellaRequest(
  env: Bindings,
  authorization: string | undefined,
  request: Request,
  type: UmbrellaOperation,
): Promise<Response> {
  const identity = bearerToken(authorization);
  if (!identity) return unauthenticatedResponse();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return errorResponse(400, 'INVALID_JSON', 'Umbrella payload must be JSON');
  }
  if (!isRecord(payload)) {
    return errorResponse(400, 'INVALID_JSON', 'Umbrella payload must be an object');
  }

  return kernelResponse(
    env,
    createEnvelope(type, payload, identity, { surface: 'worker-umbrella' }),
    true,
  );
}

export function createEnvelope(
  type: string,
  payload: JsonObject,
  identity: string,
  governanceContext: JsonObject,
  id: string = crypto.randomUUID(),
): KernelEnvelope {
  return { id, type, payload, identity, governanceContext };
}

async function kernelResponse(
  env: Bindings,
  envelope: KernelEnvelope,
  normalize = false,
): Promise<Response> {
  try {
    const response = await callKernel(env, envelope);
    const result = await response.json<KernelResult>();
    const status = result.ok === false ? kernelErrorStatus(result.error?.code) : response.status;
    if (result.ok === false || !normalize) return Response.json(result, { status });
    return Response.json(normalizeResponse(result, envelope), { status });
  } catch (error) {
    console.error('Worker to kernel bridge failed', error);
    return errorResponse(503, 'KERNEL_UNAVAILABLE', 'Kernel bridge unavailable');
  }
}

export function normalizeResponse(
  result: KernelResult,
  envelope: KernelEnvelope,
): Record<string, unknown> {
  if (!result.ok) return result;
  return {
    ok: true,
    data: extractLaneData(result),
    meta: {
      messageId: result.messageId ?? envelope.id,
      type: result.type ?? envelope.type,
      identity: result.identity ?? envelope.identity,
      route: result.route ?? result.lanes,
    },
  };
}

export function extractLaneData(response: unknown): unknown {
  if (!isRecord(response)) return {};
  if ('output' in response) return response.output;
  const results = response.results;
  if (Array.isArray(results) && isRecord(results[0]) && 'data' in results[0]) return results[0].data;

  if (!isRecord(response.result)) return {};
  const legacyLanes = response.result.lanes;
  if (!Array.isArray(legacyLanes) || !isRecord(legacyLanes[0]) || !isRecord(legacyLanes[0].result)) return {};
  const legacyResults = legacyLanes[0].result.results;
  if (!Array.isArray(legacyResults) || !isRecord(legacyResults[0]) || !isRecord(legacyResults[0].result)) return {};
  return legacyResults[0].result.data ?? {};
}

function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  return match?.[1]?.trim() || null;
}

function kernelErrorStatus(code: string): number {
  if (code === 'UNAUTHENTICATED') return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'INVALID_MESSAGE' || code === 'INVALID_JSON' || code === 'ROUTE_NOT_FOUND') return 400;
  if (code === 'INVARIANT_VIOLATION') return 422;
  return 500;
}

function unauthenticatedResponse(): Response {
  return errorResponse(401, 'UNAUTHENTICATED', 'Bearer token required');
}

function errorResponse(status: number, code: string, message: string): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

export class PortalKernel {
  private readonly storage: DurableObjectStorage;
  private readonly planetaryMode: string;
  private readonly umbrellaEnforcement: string;

  constructor(
    state: DurableObjectState,
    env: Pick<Bindings, 'PLANETARY_MODE' | 'UMBRELLA_ENFORCEMENT'>,
  ) {
    this.storage = state.storage;
    this.planetaryMode = env.PLANETARY_MODE ?? 'single';
    this.umbrellaEnforcement = env.UMBRELLA_ENFORCEMENT ?? 'strict';
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/api/kernel/message') {
      return new Response('Not Found', { status: 404 });
    }

    let envelope: unknown;
    try {
      envelope = await request.json();
    } catch {
      return errorResponse(400, 'INVALID_JSON', 'Kernel envelope must be JSON');
    }

    if (!validateEnvelope(envelope)) {
      return errorResponse(400, 'INVALID_MESSAGE', 'Kernel envelope is missing required fields');
    }

    const engine = new KernelEngine({
      identity: envelope.identity,
      governanceContext: envelope.governanceContext,
      planetaryMode: this.planetaryMode,
      umbrellaEnforcement: this.umbrellaEnforcement,
      storage: this.storage,
    });
    const result = await engine.dispatch(envelope);
    return Response.json(result, { status: result.ok ? 200 : kernelErrorStatus(result.error?.code) });
  }
}

function validateEnvelope(value: unknown): value is KernelEnvelope {
  return (
    isRecord(value) &&
    typeof value.id === 'string' &&
    value.id.length > 0 &&
    typeof value.type === 'string' &&
    value.type.length > 0 &&
    isRecord(value.payload) &&
    typeof value.identity === 'string' &&
    value.identity.length > 0 &&
    isRecord(value.governanceContext)
  );
}

export default app;

export { app, createEnvelope, extractLaneData, normalizeResponse };
