import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { attachIntrospectionRoutes } from './introspection';

export type UmbrellaMode = 'strict' | 'advisory' | 'off';
export type KernelEnvelope = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  identity: string;
  governanceContext: Record<string, unknown>;
};

type Fetcher = { fetch(request: Request): Promise<Response> };
type KernelNamespace = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): Fetcher;
};

export type Bindings = {
  PORTAL_KERNEL: KernelNamespace;
  MAX_OS_1: Fetcher;
  IDENTITY_JWT_SECRET: string;
  IDENTITY_JWT_ISSUER?: string;
  IDENTITY_JWT_AUDIENCE?: string;
  PLANETARY_MODE?: string;
  UMBRELLA_ENFORCEMENT?: string;
};

export type GovernanceMetadata = {
  mode: UmbrellaMode;
  decision: 'allowed' | 'denied' | 'advisory' | 'bypassed';
  deltas: Array<Record<string, unknown>>;
};

export type KernelLane = {
  name: string;
  result: {
    results: Array<{
      result: {
        data: Record<string, unknown>;
        meta: { source: string; governance: UmbrellaMode };
      };
    }>;
  };
};

export type KernelSuccess = {
  ok: true;
  data: Record<string, unknown>;
  lanes: KernelLane[];
  meta: {
    messageId: string;
    type: string;
    umbrella: string;
    identity: { propagated: true };
    governance: GovernanceMetadata;
  };
};

export type KernelFailure = {
  ok: false;
  error: { code: string; message: string };
  meta?: { messageId?: string; type?: string; governance?: GovernanceMetadata };
};

export type KernelResult = KernelSuccess | KernelFailure;

type UniverseState = {
  tick: number;
  properties: Record<string, unknown>;
  lastOperation: null | { messageId: string; type: string };
};

const KERNEL_OBJECT_NAME = 'portal-kernel';
const KERNEL_BRIDGE_URL = 'https://portal-kernel.invalid/api/kernel/message';
const MAX_OS_BRIDGE_URL = 'https://max-os-1.invalid/kernel/message';
const UNIVERSE_STATE_KEY = 'universe';
const INTROSPECTION_PREFIX = 'introspection.';

const UMBRELLA_OPERATIONS: Record<string, string> = {
  '/umbrella/identity/license': 'identity.physics.license',
  '/umbrella/governance/license': 'governance.engine.license',
  '/umbrella/apex/advisory': 'apex.alignment.advisory',
  '/umbrella/sim/pack': 'umbrella.sim.pack',
  '/umbrella/market/forecast': 'umbrella.market.forecast',
  '/umbrella/identity/mirror': 'umbrella.identity.mirror',
  '/umbrella/crossworld/access': 'umbrella.crossworld.access',
  '/umbrella/structural/truth/license': 'structural.truth.license',
};

export const app = new Hono<{ Bindings: Bindings }>();
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
    status: 'Portal-OS live',
    worker: 'planetary-max',
    mode: c.env.PLANETARY_MODE ?? 'single',
    umbrella: resolveUmbrellaMode(c.env.UMBRELLA_ENFORCEMENT),
  }),
);
app.get('/health', (c) =>
  c.json({
    status: 'ok',
    service: 'planetary-max',
    umbrella: resolveUmbrellaMode(c.env.UMBRELLA_ENFORCEMENT),
  }),
);
app.post('/api/kernel/message', async (c) => {
  const value = await parseEnvelope(c.req.raw, c.req.header('Authorization'), c.env);
  return value instanceof Response ? value : kernelResponse(c.env, value);
});
app.get('/api/autonomy', (c) => routeKernelMessage(c.env, c.req.header('Authorization'), 'autonomy.state', {}));
app.get('/universe/state', (c) => routeKernelMessage(c.env, c.req.header('Authorization'), 'universe.state', {}));
app.get('/universe/umbrella', (c) => routeKernelMessage(c.env, c.req.header('Authorization'), 'universe.umbrella', {}));
for (const [path, type] of Object.entries(UMBRELLA_OPERATIONS)) {
  app.post(path, async (c) => {
    const value = await parsePayload(c.req.raw, c.req.header('Authorization'), c.env);
    if (value instanceof Response) return value;
    return kernelResponse(c.env, createEnvelope(type, value.payload, value.identity, value.governanceContext, c.env.UMBRELLA_ENFORCEMENT));
  });
}
app.post('/universe/tick', async (c) => {
  const value = await parsePayload(c.req.raw, c.req.header('Authorization'), c.env, true);
  if (value instanceof Response) return value;
  return kernelResponse(c.env, createEnvelope('universe.tick', value.payload, value.identity, value.governanceContext, c.env.UMBRELLA_ENFORCEMENT));
});
app.post('/os/kernel/message', async (c) => {
  const parsed = await parseEnvelope(c.req.raw, c.req.header('Authorization'), c.env);
  if (parsed instanceof Response) return parsed;

  try {
    const preflight = {
      ...parsed,
      type: 'umbrella.os',
      payload: { ...parsed.payload, operation: parsed.type },
    };
    const governed = await callKernel(c.env, preflight);
    const checked = await readKernelResult(governed, preflight, 'PortalKernel');
    if (!checked.ok) return resultResponse(checked, governed.status);

    const response = await c.env.MAX_OS_1.fetch(
      new Request(MAX_OS_BRIDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      }),
    );

    return resultResponse(await readKernelResult(response, parsed, 'MAX-OS-1'), response.status);
  } catch {
    return failureResponse('MAX_OS_UNAVAILABLE', 'MAX-OS-1 bridge unavailable', 503);
  }
});
attachIntrospectionRoutes(app);

async function routeKernelMessage(
  env: Bindings,
  authorization: string | undefined,
  type: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const identity = await authenticatedIdentity(authorization, env);
  if (identity instanceof Response) return identity;
  return kernelResponse(env, createEnvelope(type, payload, identity, {}, env.UMBRELLA_ENFORCEMENT));
}

async function parseEnvelope(
  request: Request,
  authorization: string | undefined,
  env: Bindings,
): Promise<KernelEnvelope | Response> {
  const identity = await authenticatedIdentity(authorization, env);
  if (identity instanceof Response) return identity;

  const body = await readJsonObject(request, 'Kernel envelope must be JSON');
  if (body instanceof Response) return body;

  if (typeof body.type !== 'string' || !body.type.trim()) {
    return failureResponse('INVALID_MESSAGE', 'Kernel message type is required', 400);
  }

  if (!isRecord(body.payload)) {
    return failureResponse('INVALID_MESSAGE', 'Kernel message payload must be an object', 400);
  }

  if (body.governanceContext !== undefined && !isRecord(body.governanceContext)) {
    return failureResponse('INVALID_MESSAGE', 'Kernel governanceContext must be an object', 400);
  }

  return createEnvelope(
    body.type,
    body.payload,
    identity,
    isRecord(body.governanceContext) ? body.governanceContext : {},
    env.UMBRELLA_ENFORCEMENT,
  );
}

async function parsePayload(
  request: Request,
  authorization: string | undefined,
  env: Bindings,
  optionalBody = false,
): Promise<{ identity: string; payload: Record<string, unknown>; governanceContext: Record<string, unknown> } | Response> {
  const identity = await authenticatedIdentity(authorization, env);
  if (identity instanceof Response) return identity;

  const body = optionalBody && !request.body ? {} : await readJsonObject(request, 'Request body must be JSON');
  if (body instanceof Response) return body;

  return {
    identity,
    payload: body,
    governanceContext: {},
  };
}

async function readJsonObject(request: Request, message: string): Promise<Record<string, unknown> | Response> {
  try {
    const value: unknown = await request.json();
    return isRecord(value) ? value : failureResponse('INVALID_MESSAGE', message, 400);
  } catch {
    return failureResponse('INVALID_JSON', message, 400);
  }
}

export function createEnvelope(
  type: string,
  payload: Record<string, unknown>,
  identity: string,
  governanceContext: Record<string, unknown>,
  configuredMode?: string,
): KernelEnvelope {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    identity,
    governanceContext: {
      ...governanceContext,
      umbrellaMode: resolveUmbrellaMode(configuredMode),
    },
  };
}

async function kernelResponse(env: Bindings, envelope: KernelEnvelope): Promise<Response> {
  try {
    const response = await callKernel(env, envelope);
    return resultResponse(await readKernelResult(response, envelope, 'PortalKernel'), response.status);
  } catch {
    return failureResponse('KERNEL_UNAVAILABLE', 'PortalKernel bridge unavailable', 503);
  }
}

export async function callKernel(env: Bindings, envelope: KernelEnvelope): Promise<Response> {
  const kernel = env.PORTAL_KERNEL.get(env.PORTAL_KERNEL.idFromName(KERNEL_OBJECT_NAME));
  return kernel.fetch(
    new Request(KERNEL_BRIDGE_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(envelope),
    }),
  );
}

export async function readKernelResult(
  response: Response,
  envelope: KernelEnvelope,
  fallbackSource: string,
): Promise<KernelResult> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return failureResult('INVALID_KERNEL_RESPONSE', 'Kernel returned invalid JSON', envelope);
  }

  if (!isRecord(value)) {
    return failureResult('INVALID_KERNEL_RESPONSE', 'Kernel returned an invalid result', envelope);
  }

  if (value.ok === false) {
    const error = isRecord(value.error) ? value.error : {};
    return failureResult(
      typeof error.code === 'string' ? error.code : 'KERNEL_ERROR',
      typeof error.message === 'string' ? error.message : 'Kernel request failed',
      envelope,
    );
  }

  if (!response.ok) {
    return failureResult('KERNEL_ERROR', 'Kernel request failed', envelope);
  }

  const suppliedMeta = isRecord(value.meta) ? value.meta : {};
  const data = isRecord(value.data) ? value.data : {};

  return {
    ok: true,
    data,
    lanes: Array.isArray(value.lanes) ? (value.lanes as KernelLane[]) : [],
    meta: {
      messageId: typeof suppliedMeta.messageId === 'string' ? suppliedMeta.messageId : envelope.id,
      type: typeof suppliedMeta.type === 'string' ? suppliedMeta.type : envelope.type,
      umbrella: typeof suppliedMeta.umbrella === 'string' ? suppliedMeta.umbrella : 'none',
      identity: { propagated: true },
      governance: isGovernanceMetadata(suppliedMeta.governance)
        ? suppliedMeta.governance
        : defaultGovernance(resolveUmbrellaMode(envelope.governanceContext.umbrellaMode as string | undefined)),
    },
  };
}

function extractLaneData(lanes: KernelLane[]): Record<string, unknown> {
  return lanes[0]?.result.results[0]?.result.data ?? {};
}

export { extractLaneData };

export function resultResponse(result: KernelResult, upstreamStatus: number): Response {
  const status = result.ok
    ? upstreamStatus >= 200 && upstreamStatus < 300
      ? upstreamStatus
      : 200
    : errorStatus(result.error.code, upstreamStatus);
  return Response.json(result, { status });
}

function errorStatus(code: string, upstream = 500): number {
  if (code === 'UNAUTHENTICATED') return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'INVALID_MESSAGE' || code === 'INVALID_JSON') return 400;
  if (code === 'INVALID_KERNEL_RESPONSE') return 502;
  return upstream >= 400 ? upstream : 500;
}

export function failureResponse(code: string, message: string, status: number): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

function failureResult(code: string, message: string, envelope?: KernelEnvelope): KernelFailure {
  return {
    ok: false,
    error: { code, message },
    ...(envelope
      ? {
          meta: {
            messageId: envelope.id,
            type: envelope.type,
            governance: defaultGovernance(resolveEnvelopeMode(envelope)),
          },
        }
      : {}),
  };
}

async function authenticatedIdentity(
  header: string | undefined,
  env: Pick<Bindings, 'IDENTITY_JWT_SECRET' | 'IDENTITY_JWT_ISSUER' | 'IDENTITY_JWT_AUDIENCE'>,
): Promise<string | Response> {
  const token = bearerToken(header);
  if (!token) return failureResponse('UNAUTHENTICATED', 'Bearer token required', 401);
  if (!env.IDENTITY_JWT_SECRET) {
    return failureResponse('IDENTITY_UNAVAILABLE', 'Identity verification is not configured', 503);
  }
  if (!(await verifyIdentityJwt(token, env))) {
    return failureResponse('UNAUTHENTICATED', 'Bearer token required', 401);
  }
  return token;
}

async function verifyIdentityJwt(
  token: string,
  env: Pick<Bindings, 'IDENTITY_JWT_SECRET' | 'IDENTITY_JWT_ISSUER' | 'IDENTITY_JWT_AUDIENCE'>,
): Promise<boolean> {
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return false;
    const header = decodeJwtPart(parts[0]);
    const claims = decodeJwtPart(parts[1]);
    if (header.alg !== 'HS256' || typeof claims.sub !== 'string' || !claims.sub.trim()) return false;
    const now = Math.floor(Date.now() / 1000);
    if (typeof claims.exp !== 'number' || claims.exp <= now) return false;
    if (typeof claims.nbf === 'number' && claims.nbf > now) return false;
    if (env.IDENTITY_JWT_ISSUER && claims.iss !== env.IDENTITY_JWT_ISSUER) return false;
    if (env.IDENTITY_JWT_AUDIENCE && !jwtAudienceIncludes(claims.aud, env.IDENTITY_JWT_AUDIENCE)) return false;

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(env.IDENTITY_JWT_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify'],
    );

    return crypto.subtle.verify(
      'HMAC',
      key,
      decodeBase64Url(parts[2]),
      new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
    );
  } catch {
    return false;
  }
}

function decodeJwtPart(value: string): Record<string, unknown> {
  const decoded: unknown = JSON.parse(new TextDecoder().decode(decodeBase64Url(value)));
  if (!isRecord(decoded)) throw new Error('JWT payload is not an object');
  return decoded;
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) {
    bytes[index] = decoded.charCodeAt(index);
  }
  return bytes;
}

function jwtAudienceIncludes(value: unknown, expected: string): boolean {
  return value === expected || (Array.isArray(value) && value.some((entry) => entry === expected));
}

export function resolveUmbrellaMode(value: string | undefined): UmbrellaMode {
  return value === 'advisory' || value === 'off' || value === 'strict' ? value : 'strict';
}

function resolveEnvelopeMode(envelope: KernelEnvelope): UmbrellaMode {
  return resolveUmbrellaMode(
    typeof envelope.governanceContext.umbrellaMode === 'string'
      ? envelope.governanceContext.umbrellaMode
      : undefined,
  );
}

function defaultGovernance(mode: UmbrellaMode): GovernanceMetadata {
  return {
    mode,
    decision: mode === 'off' ? 'bypassed' : mode === 'advisory' ? 'advisory' : 'allowed',
    deltas: [],
  };
}

function isGovernanceMetadata(value: unknown): value is GovernanceMetadata {
  if (!isRecord(value)) return false;
  return (
    (value.mode === 'strict' || value.mode === 'advisory' || value.mode === 'off') &&
    (value.decision === 'allowed' || value.decision === 'denied' || value.decision === 'advisory' || value.decision === 'bypassed') &&
    Array.isArray(value.deltas)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function laneForType(type: string): string {
  if (type.startsWith(INTROSPECTION_PREFIX)) return 'introspection';
  if (type === 'umbrella.os' || type.startsWith('os.')) return 'umbrella.os';
  if (type.startsWith('umbrella.') || type.includes('license')) return 'umbrella';
  if (type.startsWith('universe.')) return 'universe';
  return 'kernel';
}

function umbrellaUpdateName(type: string): string {
  if (type === 'umbrella.os' || type.startsWith('os.')) return 'os-update';
  if (type.startsWith('umbrella.') || type.includes('license')) return 'sim-update';
  return 'kernel';
}

function makeLane(
  name: string,
  data: Record<string, unknown>,
  source: string,
  governance: UmbrellaMode,
): KernelLane {
  return {
    name,
    result: {
      results: [{
        result: {
          data,
          meta: { source, governance },
        },
      }],
    },
  };
}

export class PortalKernel {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Pick<Bindings, 'PLANETARY_MODE' | 'UMBRELLA_ENFORCEMENT'>,
  ) {}

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method !== 'POST' || url.pathname !== '/api/kernel/message') {
      return Response.json({ status: 'ok', service: 'portal-kernel' });
    }

    const body = await readJsonObject(request, 'Kernel envelope must be JSON');
    if (body instanceof Response) return body;

    const envelope = this.validateEnvelope(body);
    if (envelope instanceof Response) return envelope;

    const governance = this.evaluateGovernance(envelope);
    if (governance.decision === 'denied') {
      const denied = failureResult('FORBIDDEN', 'Umbrella governance denied the operation', envelope);
      return Response.json(
        {
          ...denied,
          meta: {
            ...(denied.meta ?? {}),
            governance,
          },
        },
        { status: 403 },
      );
    }

    const data = await this.dispatch(envelope, governance);
    return Response.json({
      ok: true,
      data,
      lanes: [makeLane(laneForType(envelope.type), data, 'PortalKernel', governance.mode)],
      meta: {
        messageId: envelope.id,
        type: envelope.type,
        umbrella: umbrellaUpdateName(envelope.type),
        identity: { propagated: true },
        governance,
      },
    });
  }

  private validateEnvelope(value: Record<string, unknown>): KernelEnvelope | Response {
    return typeof value.id === 'string' &&
      typeof value.type === 'string' &&
      isRecord(value.payload) &&
      typeof value.identity === 'string' &&
      !!value.identity.trim() &&
      isRecord(value.governanceContext)
      ? (value as KernelEnvelope)
      : failureResponse('INVALID_MESSAGE', 'Kernel envelope is incomplete', 400);
  }

  private evaluateGovernance(envelope: KernelEnvelope): GovernanceMetadata {
    const mode = resolveUmbrellaMode(this.env.UMBRELLA_ENFORCEMENT);
    if (mode === 'off') return defaultGovernance(mode);

    const context = envelope.governanceContext;
    const lane = laneForType(envelope.type);
    const operation =
      envelope.type === 'umbrella.os' && typeof envelope.payload.operation === 'string'
        ? envelope.payload.operation
        : envelope.type;

    const deltas: Array<Record<string, unknown>> = [];
    if (context.deny === true) deltas.push({ rule: 'explicit-deny', lane });
    if (Array.isArray(context.allowedLanes) && !context.allowedLanes.includes(lane)) {
      deltas.push({ rule: 'lane-access', lane });
    }
    if (isRecord(context.permissions) && context.permissions[operation] === false) {
      deltas.push({ rule: 'agent-permission', operation });
    }
    if (envelope.payload.structuralTruth === false) {
      deltas.push({ rule: 'structural-truth', invariant: 'structuralTruth' });
    }
    if (Array.isArray(context.allowedIdentities) && !context.allowedIdentities.includes(envelope.identity)) {
      deltas.push({ rule: 'identity-physics', identityAccepted: false });
    }

    return {
      mode,
      decision: deltas.length ? (mode === 'strict' ? 'denied' : 'advisory') : mode === 'advisory' ? 'advisory' : 'allowed',
      deltas,
    };
  }

  private async dispatch(envelope: KernelEnvelope, governance: GovernanceMetadata): Promise<Record<string, unknown>> {
    if (envelope.type.startsWith(INTROSPECTION_PREFIX)) {
      return this.introspectionSnapshot(envelope, governance);
    }

    if (envelope.type === 'universe.state') {
      return {
        tick: 0,
        properties: {},
        lastOperation: null,
      };
    }

    if (envelope.type === 'universe.tick') {
      const state = await this.tickUniverse(envelope);
      return {
        tick: state.tick,
        properties: state.properties,
        lastOperation: state.lastOperation,
      };
    }

    return {
      kernel: 'Portal-OS Kernel Engine',
      operation: envelope.type,
      accepted: true,
      governance,
    };
  }

  private async tickUniverse(envelope: KernelEnvelope): Promise<UniverseState> {
    const current = (await this.state.storage.get<UniverseState>(UNIVERSE_STATE_KEY)) ?? {
      tick: 0,
      properties: {},
      lastOperation: null,
    };

    const changes = isRecord(envelope.payload.changes) ? envelope.payload.changes : {};
    const nextProperties = { ...current.properties };
    for (const [key, value] of Object.entries(changes)) {
      if (typeof value === 'number') {
        const existing = typeof nextProperties[key] === 'number' ? Number(nextProperties[key]) : 0;
        nextProperties[key] = existing + value;
      } else {
        nextProperties[key] = value;
      }
    }

    const nextState: UniverseState = {
      tick: current.tick + 1,
      properties: nextProperties,
      lastOperation: {
        messageId: envelope.id,
        type: envelope.type,
      },
    };

    await this.state.storage.put(UNIVERSE_STATE_KEY, nextState);
    return nextState;
  }

  private async introspectionSnapshot(
    envelope: KernelEnvelope,
    governance: GovernanceMetadata,
  ): Promise<Record<string, unknown>> {
    const kind = envelope.type.slice(INTROSPECTION_PREFIX.length);
    return {
      kind,
      mode: governance.mode,
      allowed: governance.decision !== 'denied',
      timestamp: Date.now(),
      scope: 'portal-kernel',
      identity: envelope.identity,
    };
  }
}

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};
