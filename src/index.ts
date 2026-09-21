import { Hono } from 'hono';
import { cors } from 'hono/cors';

export type UmbrellaMode = 'strict' | 'advisory' | 'off';

export type KernelEnvelope = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  identity: string;
  governanceContext: Record<string, unknown>;
};

type Fetcher = {
  fetch(request: Request): Promise<Response>;
};

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

const UMBRELLA_OPERATIONS = {
  '/umbrella/identity/license': 'identity.physics.license',
  '/umbrella/governance/license': 'governance.engine.license',
  '/umbrella/apex/advisory': 'apex.alignment.advisory',
  '/umbrella/sim/pack': 'umbrella.sim.pack',
  '/umbrella/market/forecast': 'umbrella.market.forecast',
  '/umbrella/identity/mirror': 'umbrella.identity.mirror',
  '/umbrella/crossworld/access': 'umbrella.crossworld.access',
  '/umbrella/structural/truth/license': 'structural.truth.license',
} as const;

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
  const parsed = await parseEnvelopeRequest(
    c.req.raw,
    c.req.header('Authorization'),
    c.env,
  );
  if (parsed instanceof Response) return parsed;
  return kernelResponse(c.env, parsed);
});

app.get('/api/autonomy', (c) =>
  routeKernelMessage(c.env, c.req.header('Authorization'), 'autonomy.state', {}),
);
app.get('/universe/state', (c) =>
  routeKernelMessage(c.env, c.req.header('Authorization'), 'universe.state', {}),
);
app.get('/universe/umbrella', (c) =>
  routeKernelMessage(c.env, c.req.header('Authorization'), 'universe.umbrella', {}),
);

for (const [path, type] of Object.entries(UMBRELLA_OPERATIONS)) {
  app.post(path, async (c) => {
    const parsed = await parsePayloadRequest(c.req.raw, c.req.header('Authorization'), c.env);
    if (parsed instanceof Response) return parsed;
    return kernelResponse(
      c.env,
      createEnvelope(type, parsed.payload, parsed.identity, parsed.governanceContext, c.env.UMBRELLA_ENFORCEMENT),
    );
  });
}

app.post('/universe/tick', async (c) => {
  const parsed = await parsePayloadRequest(c.req.raw, c.req.header('Authorization'), c.env, true);
  if (parsed instanceof Response) return parsed;
  return kernelResponse(
    c.env,
    createEnvelope(
      'universe.tick',
      parsed.payload,
      parsed.identity,
      parsed.governanceContext,
      c.env.UMBRELLA_ENFORCEMENT,
    ),
  );
});

app.post('/os/kernel/message', async (c) => {
  const parsed = await parseEnvelopeRequest(
    c.req.raw,
    c.req.header('Authorization'),
    c.env,
  );
  if (parsed instanceof Response) return parsed;

  try {
    const preflightEnvelope = {
      ...parsed,
      type: 'umbrella.os',
      payload: { ...parsed.payload, operation: parsed.type },
    };
    const preflight = await callKernel(c.env, preflightEnvelope);
    const governed = await readKernelResult(preflight, preflightEnvelope, 'PortalKernel');
    if (!governed.ok) return resultResponse(governed, preflight.status);

    const response = await c.env.MAX_OS_1.fetch(
      new Request(MAX_OS_BRIDGE_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed),
      }),
    );
    const result = await readKernelResult(response, parsed, 'MAX-OS-1');
    return resultResponse(result, response.status);
  } catch (error) {
    console.error('MAX-OS-1 bridge failed', safeErrorName(error));
    return failureResponse('MAX_OS_UNAVAILABLE', 'MAX-OS-1 bridge unavailable', 503);
  }
});

async function routeKernelMessage(
  env: Bindings,
  authorization: string | undefined,
  type: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const identity = await authenticatedIdentity(authorization, env);
  if (identity instanceof Response) return identity;
  return kernelResponse(env, createEnvelope(type, payload, identity, { surface: 'worker-api' }, env.UMBRELLA_ENFORCEMENT));
}

async function parseEnvelopeRequest(
  request: Request,
  authorization: string | undefined,
  env: Bindings,
): Promise<KernelEnvelope | Response> {
  const identity = await authenticatedIdentity(authorization, env);
  if (identity instanceof Response) return identity;

  const body = await readJsonObject(request, 'Request body must be JSON');
  if (body instanceof Response) return body;
  if (typeof body.type !== 'string' || body.type.trim() === '' || (body.payload !== undefined && !isRecord(body.payload))) {
    return failureResponse('INVALID_MESSAGE', 'type and object payload are required', 400);
  }

  return createEnvelope(
    body.type,
    body.payload ?? {},
    identity,
    isRecord(body.governanceContext) ? body.governanceContext : {},
    env.UMBRELLA_ENFORCEMENT,
  );
}

async function parsePayloadRequest(
  request: Request,
  authorization: string | undefined,
  env: Bindings,
  optionalBody = false,
): Promise<{ identity: string; payload: Record<string, unknown>; governanceContext: Record<string, unknown> } | Response> {
  const identity = await authenticatedIdentity(authorization, env);
  if (identity instanceof Response) return identity;

  if (optionalBody && !request.headers.get('Content-Type')?.includes('application/json')) {
    return { identity, payload: {}, governanceContext: {} };
  }

  const body = await readJsonObject(request, 'Request body must be JSON');
  if (body instanceof Response) return body;
  const governanceContext = isRecord(body.governanceContext) ? body.governanceContext : {};
  const { governanceContext: _ignored, ...payload } = body;
  return { identity, payload, governanceContext };
}

async function readJsonObject(request: Request, message: string): Promise<Record<string, unknown> | Response> {
  try {
    const body: unknown = await request.json();
    if (!isRecord(body)) return failureResponse('INVALID_JSON', message, 400);
    return body;
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
    const result = await readKernelResult(response, envelope, 'PortalKernel');
    return resultResponse(result, response.status);
  } catch (error) {
    console.error('Worker to kernel bridge failed', safeErrorName(error));
    return failureResponse('KERNEL_UNAVAILABLE', 'Kernel bridge unavailable', 503);
  }
}

async function callKernel(env: Bindings, envelope: KernelEnvelope): Promise<Response> {
  const id = env.PORTAL_KERNEL.idFromName(KERNEL_OBJECT_NAME);
  const kernel = env.PORTAL_KERNEL.get(id);
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

  if (!isRecord(value)) return failureResult('INVALID_KERNEL_RESPONSE', 'Kernel returned an invalid result', envelope);
  if (value.ok === false) {
    const error = isRecord(value.error) ? value.error : {};
    return failureResult(
      typeof error.code === 'string' ? error.code : 'KERNEL_ERROR',
      typeof error.message === 'string' ? error.message : 'Kernel request failed',
      envelope,
      governanceFromUnknown(isRecord(value.meta) ? value.meta.governance : undefined, envelope),
    );
  }
  if (!response.ok) {
    const error = isRecord(value.error) ? value.error : {};
    return failureResult(
      typeof error.code === 'string' ? error.code : 'KERNEL_ERROR',
      typeof error.message === 'string' ? error.message : 'Kernel request failed',
      envelope,
    );
  }

  const legacyResult = isRecord(value.result) ? value.result : undefined;
  const laneValue = Array.isArray(value.lanes)
    ? value.lanes
    : legacyResult && Array.isArray(legacyResult.lanes)
      ? legacyResult.lanes
      : [];
  const mode = resolveEnvelopeMode(envelope);
  const lanes = sanitizeLanes(laneValue, fallbackSource, mode);
  const directData = isRecord(value.data) ? value.data : undefined;
  const data = directData ?? extractLaneData(lanes);
  if (lanes.length === 0) lanes.push(makeLane(laneForType(envelope.type), data, fallbackSource, mode));
  const suppliedMeta = isRecord(value.meta) ? value.meta : {};
  const governance = governanceFromUnknown(suppliedMeta.governance, envelope);

  return {
    ok: true,
    data,
    lanes,
    meta: {
      messageId: envelope.id,
      type: envelope.type,
      umbrella: typeof suppliedMeta.umbrella === 'string' ? suppliedMeta.umbrella : umbrellaUpdateName(envelope.type),
      identity: { propagated: true },
      governance,
    },
  };
}

function sanitizeLanes(value: unknown[], fallbackSource: string, mode: UmbrellaMode): KernelLane[] {
  const lanes: KernelLane[] = [];
  for (const candidate of value) {
    if (!isRecord(candidate)) continue;
    const data = extractCandidateData(candidate);
    const name = typeof candidate.name === 'string'
      ? candidate.name
      : typeof candidate.lane === 'string'
        ? candidate.lane
        : 'kernel';
    lanes.push(makeLane(name, data, fallbackSource, mode));
  }
  return lanes;
}

function extractCandidateData(candidate: Record<string, unknown>): Record<string, unknown> {
  if (isRecord(candidate.data)) return candidate.data;
  if (!isRecord(candidate.result) || !Array.isArray(candidate.result.results)) return {};
  const first = candidate.result.results[0];
  if (!isRecord(first) || !isRecord(first.result) || !isRecord(first.result.data)) return {};
  return first.result.data;
}

export function extractLaneData(lanes: KernelLane[]): Record<string, unknown> {
  return lanes[0]?.result.results[0]?.result.data ?? {};
}

function resultResponse(result: KernelResult, upstreamStatus: number): Response {
  const status = result.ok ? (upstreamStatus >= 200 && upstreamStatus < 300 ? upstreamStatus : 200) : errorStatus(result.error.code, upstreamStatus);
  return Response.json(result, { status });
}

function errorStatus(code: string, upstreamStatus = 500): number {
  if (code === 'UNAUTHENTICATED') return 401;
  if (code === 'FORBIDDEN') return 403;
  if (code === 'INVALID_JSON' || code === 'INVALID_MESSAGE') return 400;
  if (code === 'INVALID_KERNEL_RESPONSE') return 502;
  return upstreamStatus >= 400 ? upstreamStatus : 500;
}

function failureResult(
  code: string,
  message: string,
  envelope?: KernelEnvelope,
  governance?: GovernanceMetadata,
): KernelFailure {
  return {
    ok: false,
    error: { code, message },
    ...(envelope
      ? {
          meta: {
            messageId: envelope.id,
            type: envelope.type,
            governance: governance ?? defaultGovernance(resolveEnvelopeMode(envelope)),
          },
        }
      : {}),
  };
}

function failureResponse(code: string, message: string, status: number): Response {
  return Response.json(failureResult(code, message), { status });
}

function unauthenticatedResponse(): Response {
  return failureResponse('UNAUTHENTICATED', 'Bearer token required', 401);
}

function bearerToken(header: string | undefined): string | null {
  const match = /^Bearer\s+(.+)$/i.exec(header ?? '');
  return match?.[1]?.trim() || null;
}

async function authenticatedIdentity(
  authorization: string | undefined,
  env: Pick<Bindings, 'IDENTITY_JWT_SECRET' | 'IDENTITY_JWT_ISSUER' | 'IDENTITY_JWT_AUDIENCE'>,
): Promise<string | Response> {
  const token = bearerToken(authorization);
  if (!token) return unauthenticatedResponse();
  if (!env.IDENTITY_JWT_SECRET) {
    return failureResponse('IDENTITY_UNAVAILABLE', 'Identity verification is not configured', 503);
  }
  if (!(await verifyIdentityJwt(token, env))) return unauthenticatedResponse();
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
    if (header.alg !== 'HS256' || typeof claims.sub !== 'string' || claims.sub.trim() === '') return false;

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
  if (!isRecord(decoded)) throw new Error('JWT part must be an object');
  return decoded;
}

function decodeBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = atob(base64 + '='.repeat((4 - (base64.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(decoded.length));
  for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index);
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

function governanceFromUnknown(value: unknown, envelope: KernelEnvelope): GovernanceMetadata {
  const fallback = defaultGovernance(resolveEnvelopeMode(envelope));
  if (!isRecord(value)) return fallback;
  const decision = value.decision;
  return {
    mode: fallback.mode,
    decision:
      decision === 'allowed' || decision === 'denied' || decision === 'advisory' || decision === 'bypassed'
        ? decision
        : fallback.decision,
    deltas: Array.isArray(value.deltas) ? value.deltas.filter(isRecord) : [],
  };
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
      results: [
        {
          result: {
            data,
            meta: { source, governance },
          },
        },
      ],
    },
  };
}

function umbrellaUpdateName(type: string): string {
  return type === 'umbrella.os' || type.startsWith('os.') ? 'os-update' : type.startsWith('umbrella.') || type.includes('license') ? 'sim-update' : 'none';
}

function safeErrorName(error: unknown): string {
  return error instanceof Error ? error.name : 'UnknownError';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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
      return Response.json(
        failureResult('FORBIDDEN', 'Umbrella governance denied the operation', envelope, governance),
        { status: 403 },
      );
    }

    const data = await this.dispatch(envelope, governance);
    const laneName = laneForType(envelope.type);
    const mode = governance.mode;
    const result: KernelSuccess = {
      ok: true,
      data,
      lanes: [makeLane(laneName, data, 'PortalKernel', mode)],
      meta: {
        messageId: envelope.id,
        type: envelope.type,
        umbrella: umbrellaUpdateName(envelope.type),
        identity: { propagated: true },
        governance,
      },
    };
    return Response.json(result);
  }

  private validateEnvelope(value: Record<string, unknown>): KernelEnvelope | Response {
    if (
      typeof value.id !== 'string' ||
      typeof value.type !== 'string' ||
      !isRecord(value.payload) ||
      typeof value.identity !== 'string' ||
      value.identity.trim() === '' ||
      !isRecord(value.governanceContext)
    ) {
      return failureResponse('INVALID_MESSAGE', 'Kernel envelope is incomplete', 400);
    }
    return value as KernelEnvelope;
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
    const violations: Array<Record<string, unknown>> = [];
    if (context.deny === true) violations.push({ rule: 'explicit-deny', lane });
    if (Array.isArray(context.allowedLanes) && !context.allowedLanes.includes(lane)) {
      violations.push({ rule: 'lane-access', lane });
    }
    if (isRecord(context.permissions) && context.permissions[operation] === false) {
      violations.push({ rule: 'agent-permission', operation });
    }
    if (envelope.payload.structuralTruth === false) {
      violations.push({ rule: 'structural-truth', invariant: 'structuralTruth' });
    }
    if (Array.isArray(context.allowedIdentities) && !context.allowedIdentities.includes(envelope.identity)) {
      violations.push({ rule: 'identity-physics', identityAccepted: false });
    }

    return {
      mode,
      decision: violations.length === 0 ? (mode === 'advisory' ? 'advisory' : 'allowed') : mode === 'strict' ? 'denied' : 'advisory',
      deltas: violations,
    };
  }

  private async dispatch(
    envelope: KernelEnvelope,
    governance: GovernanceMetadata,
  ): Promise<Record<string, unknown>> {
    if (envelope.type === 'universe.state') return this.getUniverseState();
    if (envelope.type === 'universe.tick') return this.tickUniverse(envelope);
    if (envelope.type === 'universe.umbrella') return this.umbrellaState(governance);
    if (laneForType(envelope.type).startsWith('umbrella') || envelope.type.includes('license') || envelope.type === 'identity.physics.license') {
      return this.umbrellaDelta(envelope, governance);
    }
    return {
      kernel: 'Portal-OS Kernel Engine',
      operation: envelope.type,
      accepted: true,
    };
  }

  private async getUniverseState(): Promise<Record<string, unknown>> {
    return (await this.state.storage.get<UniverseState>(UNIVERSE_STATE_KEY)) ?? initialUniverseState();
  }

  private async tickUniverse(envelope: KernelEnvelope): Promise<Record<string, unknown>> {
    return this.state.storage.transaction(async (transaction) => {
      const universe = (await transaction.get<UniverseState>(UNIVERSE_STATE_KEY)) ?? initialUniverseState();
      const changes = isRecord(envelope.payload.changes) ? envelope.payload.changes : envelope.payload;
      const properties = { ...universe.properties };
      for (const key of Object.keys(changes).sort()) {
        const change = changes[key];
        const current = properties[key];
        properties[key] = typeof change === 'number' && typeof current === 'number' ? current + change : change;
      }
      const next: UniverseState = {
        tick: universe.tick + 1,
        properties,
        lastOperation: { messageId: envelope.id, type: envelope.type },
      };
      await transaction.put(UNIVERSE_STATE_KEY, next);
      return next;
    });
  }

  private umbrellaState(governance: GovernanceMetadata): Record<string, unknown> {
    return {
      umbrellaMode: governance.mode,
      osGovernanceFlags: { decision: governance.decision },
      osTruthInvariants: { identityRequired: true, structuralTruth: true },
      governanceDeltas: governance.deltas,
    };
  }

  private umbrellaDelta(envelope: KernelEnvelope, governance: GovernanceMetadata): Record<string, unknown> {
    return {
      osPermissions: isRecord(envelope.payload.permissions) ? envelope.payload.permissions : {},
      osIdentity: { authenticated: true, physicsApplied: envelope.type.includes('identity') },
      osGovernanceFlags: { mode: governance.mode, decision: governance.decision },
      osTruthInvariants: { identityRequired: true, structuralTruth: true },
      governanceDeltas: governance.deltas,
    };
  }
}

function laneForType(type: string): string {
  if (type === 'umbrella.os' || type.startsWith('os.')) return 'umbrella.os';
  if (type === 'identity.physics.license') return 'umbrella.identity-physics';
  if (type === 'structural.truth.license') return 'umbrella.structural-truth';
  if (type.startsWith('umbrella.') || type.includes('governance') || type.includes('license')) return 'umbrella.sim';
  if (type.startsWith('universe.')) return 'universe';
  return 'kernel';
}

function initialUniverseState(): UniverseState {
  return { tick: 0, properties: {}, lastOperation: null };
}

export default {
  async fetch(request: Request, env: Bindings, ctx: ExecutionContext): Promise<Response> {
    return app.fetch(request, env, ctx);
  },
};

export { app };
