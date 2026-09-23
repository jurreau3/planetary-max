import { describe, expect, it, vi } from 'vitest';
import {
  PortalKernel,
  app,
  createEnvelope,
  extractLaneData,
  readKernelResult,
  resolveUmbrellaMode,
  type Bindings,
  type KernelEnvelope,
  type KernelLane,
  type PortalKernelState,
  type SimEvent,
  type SimEventType,
  type SimTickDiff,
} from '../src/index';

const TOKEN = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJ0ZXN0LXVzZXIiLCJpc3MiOiJwb3J0YWwtbG9naW4iLCJhdWQiOiJwbGFuZXRhcnktbWF4IiwiZXhwIjo0MTAyNDQ0ODAwfQ.MWNP0Fu3Ky8BUTACh5fSViDpRZL2SkN5moFjzAvQAwg';
const IDENTITY_JWT_SECRET = 'unit-test-signing-secret';

class MemoryStorage {
  private readonly values = new Map<string, unknown>();

  async get<T>(key: string): Promise<T | undefined> {
    return this.values.get(key) as T | undefined;
  }

  async put(key: string, value: unknown): Promise<void> {
    this.values.set(key, structuredClone(value));
  }

  async transaction<T>(callback: (transaction: MemoryStorage) => Promise<T>): Promise<T> {
    return callback(this);
  }
}

function makeKernel(mode = 'strict', storage: MemoryStorage = new MemoryStorage()): PortalKernel {
  return new PortalKernel(
    { storage } as unknown as DurableObjectState,
    { UMBRELLA_ENFORCEMENT: mode },
  );
}

function makeBindings(options: {
  mode?: string;
  kernel?: PortalKernel;
  maxOsFetch?: (request: Request) => Promise<Response>;
} = {}): Bindings {
  const kernel = options.kernel ?? makeKernel(options.mode);
  return {
    PLANETARY_MODE: 'single',
    UMBRELLA_ENFORCEMENT: options.mode ?? 'strict',
    IDENTITY_JWT_SECRET,
    IDENTITY_JWT_ISSUER: 'portal-login',
    IDENTITY_JWT_AUDIENCE: 'planetary-max',
    PORTAL_KERNEL: {
      idFromName: () => ({}) as DurableObjectId,
      get: () => ({ fetch: (request) => kernel.fetch(request) }),
    },
    MAX_OS_1: {
      fetch:
        options.maxOsFetch ??
        (async () =>
          Response.json({
            ok: true,
            result: { accepted: true },
            meta: { umbrella: 'os-update' },
          })),
    },
  };
}

function authorized(method = 'GET', body?: unknown): RequestInit {
  return {
    method,
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  };
}

function envelope(
  type: string,
  payload: Record<string, unknown> = {},
  governanceContext: Record<string, unknown> = {},
): KernelEnvelope {
  return {
    id: `message-${type}`,
    type,
    payload,
    identity: TOKEN,
    governanceContext: { ...governanceContext, umbrellaMode: 'strict' },
  };
}

async function kernelRequest(kernel: PortalKernel, value: unknown, raw = false): Promise<Response> {
  return kernel.fetch(
    new Request('https://kernel.test/api/kernel/message', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: raw ? String(value) : JSON.stringify(value),
    }),
  );
}

async function simulationRequest(
  kernel: PortalKernel,
  path: '/kernel/sim/event' | '/kernel/sim/tick' | '/kernel/sim/state',
  method: 'GET' | 'POST',
  body?: unknown,
): Promise<Response> {
  return kernel.fetch(
    new Request(`https://kernel.test${path}`, {
      method,
      ...(body === undefined
        ? {}
        : {
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
          }),
    }),
  );
}

function simulationEvent(
  id: string,
  type: SimEventType,
  payload: Record<string, unknown>,
  at: number,
  identityId?: string,
): SimEvent {
  return { id, type, payload, at, ...(identityId === undefined ? {} : { identityId }) };
}

function instituteFormation(
  id: string,
  at: number,
  confidence = 0.9,
): Record<string, unknown> {
  const factId = `${id}-fact`;
  return {
    id,
    description: `Stable structure ${id}`,
    at,
    facts: [{ id: factId, description: `Inference ${id}`, confidence }],
    hypotheses: [{
      id: `${id}-hypothesis`,
      factIds: [factId],
      confidence: 0.85,
      curvatureGuidance: 0.4,
      collapsePolicySuggestion: 'governed',
    }],
    quantumBranches: [
      { factId, probability: 0.8, curvature: 0.25, signature: 'quantum-stable' },
      { factId, probability: 0.7, curvature: 0.5, signature: 'quantum-stable' },
    ],
    simulationDeltas: [
      { factId, tick: 1 },
      { factId, tick: 2 },
    ],
  };
}

function planetaryNode(
  nodeId: string,
  options: {
    identitySignature?: string;
    identityCurvature?: number;
    truthStability?: number;
    truthDescription?: string;
    quantumSignature?: string;
    probability?: number;
    tick?: number;
  } = {},
): Record<string, unknown> {
  const quantumSignature = options.quantumSignature ?? 'quantum-stable';
  return {
    nodeId,
    tick: options.tick ?? 1,
    inferenceDelta: { hypothesesProcessed: 1 },
    identities: [{
      id: 'identity-1',
      originNode: 'node-a',
      curvature: options.identityCurvature ?? 0.4,
      signature: options.identitySignature ?? 'identity-stable',
      timeline: {
        identityId: 'identity-1',
        events: [{ id: 'truth-global:1:added', truthId: 'truth-global', action: 'added', at: 10, meta: {} }],
      },
    }],
    substrates: [{
      id: 'earth',
      nodes: [nodeId],
      topology: { region: nodeId },
      stability: 0.9,
      anomalies: [],
    }],
    quantumBranches: [{
      id: `branch-${nodeId}`,
      node: nodeId,
      probability: options.probability ?? 0.8,
      curvature: 0.3,
      signature: quantumSignature,
    }],
    canon: {
      truths: {
        'truth-global': {
          id: 'truth-global',
          description: options.truthDescription ?? 'Shared planetary structure',
          sourceFacts: ['fact-global'],
          stability: options.truthStability ?? 0.8,
          curvature: 0.3,
          createdAt: 10,
          updatedAt: 10,
        },
      },
      version: 1,
      updatedAt: 10,
    },
    truthSignatures: { 'truth-global': quantumSignature },
  };
}

function planetarySynchronization(
  nodes: Record<string, unknown>[],
  governance: Record<string, unknown> = {},
  runtime: { at?: number; collapsePolicy?: string; seed?: string } = {},
): Record<string, unknown> {
  return {
    at: runtime.at ?? 20,
    nodes,
    collapsePolicy: runtime.collapsePolicy ?? 'governed',
    ...(runtime.seed === undefined ? {} : { seed: runtime.seed }),
    governance: {
      mode: 'strict',
      nodePolicies: {},
      globalTruthRules: {},
      collapseRules: {},
      ...governance,
    },
  };
}

async function planetaryRequest(
  kernel: PortalKernel,
  payload: Record<string, unknown>,
  type = 'planetary.sync',
): Promise<Response> {
  return app.request(
    '/api/kernel/message',
    authorized('POST', { type, payload }),
    makeBindings({ kernel }),
  );
}

async function instituteRequest(
  kernel: PortalKernel,
  payload: Record<string, unknown>,
  governanceContext: Record<string, unknown> = {},
): Promise<Response> {
  return app.request(
    '/api/kernel/message',
    authorized('POST', { type: 'institute.truth.form', payload, governanceContext }),
    makeBindings({ kernel }),
  );
}

describe('kernel result helpers', () => {
  it('resolves all supported umbrella modes', () => {
    expect(['strict', 'advisory', 'off'].map(resolveUmbrellaMode)).toEqual(['strict', 'advisory', 'off']);
  });

  it('fails closed for an unknown umbrella mode', () => {
    expect(resolveUmbrellaMode('enabled')).toBe('strict');
  });

  it('injects configured governance without allowing a caller override', () => {
    const value = createEnvelope('sim.step', {}, TOKEN, { tenant: 'one', umbrellaMode: 'off' }, 'strict');
    expect(value.governanceContext).toMatchObject({
      tenant: 'one',
      mode: 'strict',
      umbrellaMode: 'strict',
      decision: 'allowed',
      rationale: 'Umbrella governance allows the operation',
    });
  });

  it('creates a deeply immutable envelope without freezing caller input', () => {
    const payload = { nested: { value: 1 } };
    const value = createEnvelope('sim.step', payload, 'test-user', {}, 'strict');
    expect(Object.isFrozen(value)).toBe(true);
    expect(Object.isFrozen(value.payload.nested)).toBe(true);
    expect(() => Object.assign(value.payload.nested as object, { value: 2 })).toThrow();
    payload.nested.value = 3;
    expect(value.payload.nested).toEqual({ value: 1 });
  });

  it('extracts normalized lane data', () => {
    const lanes = [
      {
        name: 'umbrella.os',
        result: { results: [{ result: { data: { allowed: true }, meta: { source: 'test', governance: 'strict' } } }] },
      },
    ] as KernelLane[];
    expect(extractLaneData(lanes)).toEqual({ allowed: true });
  });
});

describe('Hono Worker routes', () => {
  it('reports deployment health', async () => {
    const response = await app.request('/health', undefined, makeBindings());
    expect(await response.json()).toEqual({ status: 'ok', service: 'planetary-max', umbrella: 'strict' });
  });

  it('rejects a kernel request with a missing or invalid bearer token', async () => {
    const missing = await app.request('/api/kernel/message', { method: 'POST' }, makeBindings());
    const invalid = await app.request(
      '/api/kernel/message',
      authorized('POST', { type: 'sim.step', payload: {} }),
      { ...makeBindings(), IDENTITY_JWT_SECRET: 'different-signing-secret' },
    );
    expect(missing.status).toBe(401);
    expect(invalid.status).toBe(401);
  });

  it('requires the exact Bearer authorization scheme', async () => {
    const response = await app.request(
      '/api/kernel/message',
      {
        method: 'POST',
        headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'sim.step', payload: {} }),
      },
      makeBindings(),
    );
    expect(response.status).toBe(401);
  });

  it('validates JWT issuer and audience claims', async () => {
    const request = authorized('POST', { type: 'sim.step', payload: {} });
    const wrongIssuer = await app.request(
      '/api/kernel/message',
      request,
      { ...makeBindings(), IDENTITY_JWT_ISSUER: 'another-issuer' },
    );
    const wrongAudience = await app.request(
      '/api/kernel/message',
      request,
      { ...makeBindings(), IDENTITY_JWT_AUDIENCE: 'another-audience' },
    );
    expect(wrongIssuer.status).toBe(401);
    expect(wrongAudience.status).toBe(401);
  });

  it('rejects malformed JSON', async () => {
    const response = await app.request(
      '/api/kernel/message',
      { method: 'POST', headers: { Authorization: `Bearer ${TOKEN}` }, body: '{' },
      makeBindings(),
    );
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'INVALID_JSON' } });
  });

  it('rejects a non-object payload', async () => {
    const response = await app.request(
      '/api/kernel/message',
      authorized('POST', { type: 'sim.step', payload: [] }),
      makeBindings(),
    );
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'INVALID_MESSAGE' } });
  });

  it('returns a normalized kernel result', async () => {
    const response = await app.request(
      '/api/kernel/message',
      authorized('POST', { type: 'sim.step', payload: { value: 1 } }),
      makeBindings(),
    );
    expect(await response.json()).toMatchObject({
      ok: true,
      result: { kernel: 'Portal-OS Kernel Engine', operation: 'sim.step', accepted: true },
      meta: { type: 'sim.step', identity: { propagated: true } },
    });
  });

  it('never returns the bearer token', async () => {
    const response = await app.request(
      '/api/kernel/message',
      authorized('POST', { type: 'sim.step', payload: {} }),
      makeBindings(),
    );
    expect(await response.text()).not.toContain(TOKEN);
  });

  it('returns DO-backed universe state', async () => {
    const response = await app.request('/universe/state', authorized(), makeBindings());
    expect(await response.json()).toMatchObject({ ok: true, result: { tick: 0, properties: {} } });
  });

  it('ticks the universe with an empty body', async () => {
    const response = await app.request('/universe/tick', authorized('POST'), makeBindings());
    expect(await response.json()).toMatchObject({ ok: true, result: { tick: 1 } });
  });

  it('applies deterministic universe changes', async () => {
    const bindings = makeBindings();
    const first = await app.request('/universe/tick', authorized('POST', { changes: { resources: 2 } }), bindings);
    const second = await app.request('/universe/tick', authorized('POST', { changes: { resources: 3 } }), bindings);
    expect(await first.json()).toMatchObject({ result: { tick: 1, properties: { resources: 2 } } });
    expect(await second.json()).toMatchObject({ result: { tick: 2, properties: { resources: 5 } } });
  });

  it('returns umbrella state', async () => {
    const response = await app.request('/universe/umbrella', authorized(), makeBindings());
    expect(await response.json()).toMatchObject({
      result: { umbrellaMode: 'strict', osTruthInvariants: { structuralTruth: true } },
    });
  });

  it('routes identity physics through an umbrella lane', async () => {
    const response = await app.request('/umbrella/identity/license', authorized('POST', {}), makeBindings());
    expect(await response.json()).toMatchObject({
      result: { osIdentity: { authenticated: true, physicsApplied: true } },
    });
  });

  it('enforces structural truth', async () => {
    const response = await app.request(
      '/umbrella/structural/truth/license',
      authorized('POST', { structuralTruth: false }),
      makeBindings(),
    );
    expect(response.status).toBe(403);
  });

  it('answers CORS preflight requests', async () => {
    const response = await app.request(
      '/api/kernel/message',
      { method: 'OPTIONS', headers: { Origin: 'https://portal.example' } },
      makeBindings(),
    );
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
  });

  it('returns a sanitized gateway error for an invalid kernel response', async () => {
    const bindings = makeBindings();
    bindings.PORTAL_KERNEL.get = () => ({ fetch: async () => new Response(`invalid-${TOKEN}`) });
    const response = await app.request('/universe/state', authorized(), bindings);
    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain(TOKEN);
  });

  it('protects the MAX-OS-1 bridge with authentication', async () => {
    const response = await app.request('/os/kernel/message', { method: 'POST' }, makeBindings());
    expect(response.status).toBe(401);
  });

  it('rejects an invalid JWT on the MAX-OS-1 bridge', async () => {
    const response = await app.request(
      '/os/kernel/message',
      authorized('POST', { type: 'sim.step', payload: {} }),
      { ...makeBindings(), IDENTITY_JWT_SECRET: 'different-signing-secret' },
    );
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'UNAUTHENTICATED' },
    });
  });

  it('rejects a malformed MAX-OS payload before dispatch', async () => {
    const maxOsFetch = vi.fn(async () => Response.json({ ok: true }));
    const response = await app.request(
      '/os/kernel/message',
      authorized('POST', { type: 'sim.step', payload: [] }),
      makeBindings({ maxOsFetch }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_MESSAGE' },
    });
    expect(maxOsFetch).not.toHaveBeenCalled();
  });

  it('maps non-JSON MAX-OS responses to INVALID_KERNEL_RESPONSE', async () => {
    const response = await app.request(
      '/os/kernel/message',
      authorized('POST', { type: 'sim.step', payload: {} }),
      makeBindings({ maxOsFetch: async () => new Response('not-json') }),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_KERNEL_RESPONSE' },
    });
  });

  it('maps non-object MAX-OS responses to INVALID_KERNEL_RESPONSE', async () => {
    const response = await app.request(
      '/os/kernel/message',
      authorized('POST', { type: 'sim.step', payload: {} }),
      makeBindings({ maxOsFetch: async () => Response.json([]) }),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_KERNEL_RESPONSE' },
    });
  });

  it('rejects a contradictory MAX-OS success body with a failure status', async () => {
    const response = await app.request(
      '/os/kernel/message',
      authorized('POST', { type: 'sim.step', payload: {} }),
      makeBindings({
        maxOsFetch: async () => Response.json({ ok: true, result: {} }, { status: 500 }),
      }),
    );
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_KERNEL_RESPONSE' },
    });
  });

  it('does not call MAX-OS-1 when DO governance denies the request', async () => {
    const maxOsFetch = vi.fn(async () => Response.json({ ok: true }));
    const response = await app.request(
      '/os/kernel/message',
      authorized('POST', {
        type: 'identity.physics',
        payload: {},
        governanceContext: { permissions: { 'identity.physics': false } },
      }),
      makeBindings({ maxOsFetch }),
    );
    expect(response.status).toBe(403);
    expect(maxOsFetch).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      ok: false,
      error: {
        code: 'FORBIDDEN',
        message: 'Umbrella governance denied the operation',
      },
      meta: { governance: { mode: 'strict', decision: 'denied' } },
    });
  });

  it('normalizes MAX-OS-1 umbrella results', async () => {
    const response = await app.request(
      '/os/kernel/message',
      authorized('POST', { type: 'identity.physics', payload: {} }),
      makeBindings(),
    );
    expect(await response.json()).toMatchObject({
      ok: true,
      result: { accepted: true },
      meta: {
        umbrella: 'os-update',
        kernel: 'MAX-OS-1',
        type: 'identity.physics',
        identity: { propagated: true },
      },
    });
  });

  it('preserves identity and governance context across the MAX-OS-1 bridge', async () => {
    let forwarded: KernelEnvelope | undefined;
    const response = await app.request(
      '/os/kernel/message',
      authorized('POST', { type: 'governance.inspect', payload: {}, governanceContext: { tenant: 'earth' } }),
      makeBindings({
        maxOsFetch: async (request) => {
          forwarded = await request.json<KernelEnvelope>();
          return Response.json({ ok: true, result: { accepted: true }, meta: { umbrella: 'os-update' } });
        },
      }),
    );
    expect(response.status).toBe(200);
    expect(forwarded).toMatchObject({
      identity: 'test-user',
      governanceContext: {
        tenant: 'earth',
        mode: 'strict',
        umbrellaMode: 'strict',
        decision: 'allowed',
        rationale: 'Umbrella governance allows the operation',
      },
    });
  });

  it.each([
    ['sim/behavior', 'sim.behavior'],
    ['identity/timeline', 'identity.timeline'],
    ['windows/focus', 'windows.focus'],
    ['windows/state', 'windows.state'],
    ['windows/timeline', 'windows.timeline'],
    ['umbrella/enforcement', 'umbrella.enforcement'],
    ['kernel/heatmap', 'kernel.heatmap'],
    ['tec/pipeline', 'tec.pipeline'],
    ['substrate/state', 'substrate.state'],
    ['messages', 'messages'],
    ['logs', 'logs'],
    ['inference', 'inference'],
    ['institute/canon', 'institute.canon'],
    ['institute/truths', 'institute.truths'],
    ['institute/timeline', 'institute.timeline'],
    ['institute/stability', 'institute.stability'],
    ['institute/signature', 'institute.signature'],
    ['institute/timelines', 'institute.timelines'],
    ['planetary/identity', 'planetary.identity'],
    ['planetary/substrate', 'planetary.substrate'],
    ['planetary/quantum', 'planetary.quantum'],
    ['planetary/canon', 'planetary.canon'],
    ['planetary/governance', 'planetary.governance'],
    ['planetary/state', 'planetary.state'],
  ])('exposes introspection route %s', async (route, kind) => {
    const response = await app.request(`/api/introspection/${route}`, undefined, makeBindings());
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      introspection: kind,
      worker: 'planetary-max',
    });
  });
});

describe('MAX-Institute truth layer', () => {
  it('forms stable truths and records an identity-bound epistemic timeline', async () => {
    const kernel = makeKernel();
    const response = await instituteRequest(kernel, instituteFormation('truth-1', 10));
    const body = await response.json<{
      result: {
        truth: { id: string; sourceFacts: string[]; stability: number; curvature: number };
        epistemicEvent: { action: string; meta: { identityId: string } };
        canonVersion: number;
      };
    }>();
    const state = await kernel.fetch(new Request('https://kernel.test/kernel/institute/state'));
    const stateBody = await state.json<{
      result: { canon: { truths: Record<string, unknown>; version: number }; timelines: Record<string, unknown> };
    }>();

    expect(response.status).toBe(200);
    expect(body.result.truth).toMatchObject({
      id: 'truth-1',
      sourceFacts: ['truth-1-fact'],
      curvature: 0.383334,
    });
    expect(body.result.truth.stability).toBeGreaterThanOrEqual(0.6);
    expect(body.result.epistemicEvent).toMatchObject({
      action: 'added',
      meta: { identityId: 'test-user' },
    });
    expect(body.result.canonVersion).toBe(1);
    expect(stateBody.result.canon.truths).toHaveProperty('truth-1');
    expect(stateBody.result.timelines).toHaveProperty('test-user');
  });

  it('rejects patterns that do not persist across simulation ticks without changing canon', async () => {
    const kernel = makeKernel();
    const formation = instituteFormation('unstable-truth', 10);
    formation.simulationDeltas = [{ factId: 'unstable-truth-fact', tick: 1 }];
    const response = await instituteRequest(kernel, formation);
    const state = await kernel.fetch(new Request('https://kernel.test/kernel/institute/state'));

    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'UNSTABLE_INSTITUTE_PATTERN' },
    });
    expect(await state.json()).toMatchObject({
      result: { canon: { truths: {}, version: 0 }, timelines: {} },
    });
  });

  it('updates canon deterministically while preserving truth creation time', async () => {
    const kernel = makeKernel();
    await instituteRequest(kernel, instituteFormation('truth-1', 10));
    const update = instituteFormation('truth-1', 20);
    update.description = 'Refined stable structure';
    const response = await instituteRequest(kernel, update);

    expect(await response.json()).toMatchObject({
      result: {
        truth: { description: 'Refined stable structure', createdAt: 10, updatedAt: 20 },
        epistemicEvent: { id: 'truth-1:2:updated', action: 'updated' },
        canonVersion: 2,
      },
    });
  });

  it('exposes canon and epistemic timelines through Institute introspection', async () => {
    const kernel = makeKernel();
    const bindings = makeBindings({ kernel });
    await instituteRequest(kernel, instituteFormation('truth-1', 10));

    const canon = await app.request('/api/introspection/institute/canon', undefined, bindings);
    const timelines = await app.request('/api/introspection/institute/timelines', undefined, bindings);

    expect(await canon.json()).toMatchObject({
      ok: true,
      introspection: 'institute.canon',
      result: { version: 1, truths: { 'truth-1': { id: 'truth-1' } } },
    });
    expect(await timelines.json()).toMatchObject({
      ok: true,
      introspection: 'institute.timelines',
      result: [{ identityId: 'test-user', events: [{ truthId: 'truth-1', action: 'added' }] }],
    });
  });

  it('does not form a truth when Umbrella governance denies it', async () => {
    const kernel = makeKernel();
    const response = await instituteRequest(
      kernel,
      instituteFormation('denied-truth', 10),
      { permissions: { 'institute.truth.form': false } },
    );
    const state = await kernel.fetch(new Request('https://kernel.test/kernel/institute/state'));

    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ error: { code: 'FORBIDDEN' } });
    expect(await state.json()).toMatchObject({ result: { canon: { version: 0, truths: {} } } });
  });

  it('increments canon only for material truth changes', async () => {
    const kernel = makeKernel();
    await instituteRequest(kernel, instituteFormation('truth-1', 10));
    const unchanged = await instituteRequest(kernel, instituteFormation('truth-1', 20));

    expect(await unchanged.json()).toMatchObject({
      result: { canonVersion: 1, changed: false, truth: { updatedAt: 10 } },
    });
  });

  it('applies strict truth thresholds and records advisory governance metadata', async () => {
    const strictKernel = makeKernel();
    const denied = await instituteRequest(
      strictKernel,
      instituteFormation('truth-strict', 10),
      { stabilityThreshold: 0.95 },
    );
    const advisoryKernel = makeKernel('advisory');
    const advisory = await instituteRequest(
      advisoryKernel,
      instituteFormation('truth-advisory', 10),
      { stabilityThreshold: 0.95 },
    );

    expect(denied.status).toBe(403);
    expect(await denied.json()).toMatchObject({ error: { code: 'INSTITUTE_GOVERNANCE_DENIED' } });
    expect(await advisory.json()).toMatchObject({
      result: {
        epistemicEvent: { meta: { governance: { mode: 'advisory', decision: 'advisory' } } },
      },
    });
  });

  it('raises stability when stronger evidence materially updates a truth', async () => {
    const kernel = makeKernel();
    const first = await instituteRequest(kernel, instituteFormation('truth-growth', 10, 0.6));
    const second = await instituteRequest(kernel, instituteFormation('truth-growth', 20, 1));
    const firstBody = await first.json<{ result: { truth: { stability: number } } }>();
    const secondBody = await second.json<{ result: { truth: { stability: number }; changed: boolean } }>();

    expect(secondBody.result.changed).toBe(true);
    expect(secondBody.result.truth.stability).toBeGreaterThan(firstBody.result.truth.stability);
  });

  it('exposes truth, timeline, stability, and signature Institute views', async () => {
    const kernel = makeKernel();
    const bindings = makeBindings({ kernel });
    await instituteRequest(kernel, instituteFormation('truth-1', 10));

    const truths = await app.request('/api/introspection/institute/truths', undefined, bindings);
    const timeline = await app.request(
      '/api/introspection/institute/timeline?identityId=test-user',
      undefined,
      bindings,
    );
    const stability = await app.request('/api/introspection/institute/stability', undefined, bindings);
    const signature = await app.request('/api/introspection/institute/signature', undefined, bindings);

    expect(await truths.json()).toMatchObject({ result: [{ id: 'truth-1' }] });
    expect(await timeline.json()).toMatchObject({ result: { identityId: 'test-user' } });
    expect(await stability.json()).toMatchObject({ result: { 'truth-1': expect.any(Number) } });
    expect(await signature.json()).toMatchObject({
      result: { truths: { 'truth-1': ['quantum-stable'] } },
    });
  });
});

describe('Planetary Mode', () => {
  it('produces identical global state for identical node snapshots in any order', async () => {
    const first = makeKernel();
    const second = makeKernel();
    const nodeA = planetaryNode('node-a');
    const nodeB = planetaryNode('node-b');
    const firstResponse = await planetaryRequest(
      first,
      planetarySynchronization([nodeA, nodeB]),
      'planetary.tick',
    );
    const secondResponse = await planetaryRequest(
      second,
      planetarySynchronization([nodeB, nodeA]),
      'planetary.tick',
    );
    const firstBody = await firstResponse.json<{ result: { state: unknown } }>();
    const secondBody = await secondResponse.json<{ result: { state: unknown } }>();

    expect(firstResponse.status).toBe(200);
    expect(firstBody.result.state).toEqual(secondBody.result.state);
    expect(firstBody.result.state).toMatchObject({
      globalTick: 1,
      packetSignature: expect.stringMatching(/^[0-9a-f]{64}$/),
    });
  });

  it('forms a global canon and synchronized governed quantum collapse', async () => {
    const response = await planetaryRequest(
      makeKernel(),
      planetarySynchronization([planetaryNode('node-a'), planetaryNode('node-b')]),
    );

    expect(await response.json()).toMatchObject({
      result: {
        state: {
          canon: {
            truths: { 'truth-global': { stability: 0.8 } },
            globalStability: 0.8,
          },
          quantum: {
            globalSignature: 'quantum-stable',
            globalCurvature: 0.3,
            collapsePolicy: 'governed',
          },
          identities: { 'identity-1': { signature: 'identity-stable', curvature: 0.4 } },
        },
      },
    });
  });

  it('lets strict global truth rules override locally accepted truths', async () => {
    const response = await planetaryRequest(
      makeKernel(),
      planetarySynchronization(
        [planetaryNode('node-a'), planetaryNode('node-b')],
        { globalTruthRules: { minStability: 0.95 } },
      ),
    );

    expect(await response.json()).toMatchObject({
      result: { state: { canon: { truths: {}, globalStability: 0 } } },
    });
  });

  it('reconciles divergent identity signatures deterministically in strict mode', async () => {
    const kernel = makeKernel();
    const response = await planetaryRequest(
      kernel,
      planetarySynchronization([
        planetaryNode('node-a', { identitySignature: 'signature-a' }),
        planetaryNode('node-b', { identitySignature: 'signature-b' }),
      ]),
      'planetary.tick',
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: {
        state: {
          identities: { 'identity-1': { signature: 'signature-a' } },
          nodes: {
            'node-a': { identities: [{ signature: 'signature-a' }] },
            'node-b': { identities: [{ signature: 'signature-a' }] },
          },
          advisories: ['identity:identity-1:replica-divergence'],
        },
      },
    });
  });

  it('reconciles divergent identity curvature across every node in strict mode', async () => {
    const response = await planetaryRequest(
      makeKernel(),
      planetarySynchronization([
        planetaryNode('node-a', { identityCurvature: 0.3 }),
        planetaryNode('node-b', { identityCurvature: 0.6 }),
      ]),
      'planetary.tick',
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: {
        state: {
          identities: { 'identity-1': { curvature: 0.375 } },
          nodes: {
            'node-a': { identities: [{ curvature: 0.375 }] },
            'node-b': { identities: [{ curvature: 0.375 }] },
          },
        },
      },
    });
  });

  it('filters unsafe quantum signatures under strict global governance', async () => {
    const response = await planetaryRequest(
      makeKernel(),
      planetarySynchronization(
        [
          planetaryNode('node-a', { quantumSignature: 'unsafe' }),
          planetaryNode('node-b', { quantumSignature: 'safe' }),
        ],
        { collapseRules: { deniedSignatures: ['unsafe'] } },
      ),
    );

    expect(await response.json()).toMatchObject({
      result: { state: { quantum: { globalSignature: 'safe', branches: [{ signature: 'safe' }] } } },
    });
  });

  it('allows identity divergence in advisory mode and records an explanation', async () => {
    const response = await planetaryRequest(
      makeKernel(),
      planetarySynchronization(
        [
          planetaryNode('node-a', { identitySignature: 'signature-a' }),
          planetaryNode('node-b', { identitySignature: 'signature-b' }),
        ],
        { mode: 'advisory' },
      ),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      result: { state: { advisories: ['identity:identity-1:replica-divergence'] } },
    });
  });

  it('reproduces probabilistic collapse from the same seed', async () => {
    const payload = planetarySynchronization(
      [
        planetaryNode('node-a', { quantumSignature: 'branch-a', probability: 0.35, tick: 4 }),
        planetaryNode('node-b', { quantumSignature: 'branch-b', probability: 0.65, tick: 7 }),
      ],
      {},
      { collapsePolicy: 'probabilistic', seed: 'reproducible-seed' },
    );
    const first = await planetaryRequest(makeKernel(), payload, 'planetary.tick');
    const second = await planetaryRequest(makeKernel(), payload, 'planetary.tick');
    const firstBody = await first.json<{
      result: { state: { globalTick: number; quantum: { selectedBranch: unknown } } };
    }>();
    const secondBody = await second.json<{
      result: { state: { quantum: { selectedBranch: unknown } } };
    }>();

    expect(first.status).toBe(200);
    expect(firstBody.result.state.globalTick).toBe(7);
    expect(firstBody.result.state.quantum.selectedBranch).toEqual(
      secondBody.result.state.quantum.selectedBranch,
    );
  });

  it('propagates collapse and stabilizes canon and epistemic timelines on every tick', async () => {
    const response = await planetaryRequest(
      makeKernel(),
      planetarySynchronization([planetaryNode('node-a'), planetaryNode('node-b')]),
      'planetary.tick',
    );

    expect(await response.json()).toMatchObject({
      result: {
        state: {
          canon: {
            version: 2,
            updatedAt: 20,
            globalStability: 0.9,
            truths: { 'truth-global': { stability: 0.9, updatedAt: 20 } },
          },
          identities: {
            'identity-1': {
              curvature: 0.35,
              timeline: {
                events: expect.arrayContaining([expect.objectContaining({
                  id: 'planetary:1:identity-1:truth-global:updated',
                  action: 'updated',
                  meta: expect.objectContaining({
                    governance: { mode: 'strict', decision: 'allowed' },
                  }),
                })]),
              },
            },
          },
          nodes: {
            'node-a': {
              quantumBranches: [{ signature: 'quantum-stable', probability: 1 }],
              canon: { version: 2 },
              identities: [{ curvature: 0.35 }],
            },
            'node-b': {
              quantumBranches: [{ signature: 'quantum-stable', probability: 1 }],
              canon: { version: 2 },
              identities: [{ curvature: 0.35 }],
            },
          },
        },
      },
    });
  });

  it('deprecates conflicting cross-node truths in identity timelines', async () => {
    const response = await planetaryRequest(
      makeKernel(),
      planetarySynchronization([
        planetaryNode('node-a'),
        planetaryNode('node-b', { truthDescription: 'Conflicting planetary structure' }),
      ]),
      'planetary.tick',
    );

    expect(await response.json()).toMatchObject({
      result: {
        state: {
          canon: { version: 2, truths: {}, globalStability: 0 },
          identities: {
            'identity-1': {
              timeline: {
                events: expect.arrayContaining([expect.objectContaining({
                  id: 'planetary:1:identity-1:truth-global:deprecated',
                  action: 'deprecated',
                })]),
              },
            },
          },
          advisories: ['truth:truth-global:global-convergence-conflict'],
        },
      },
    });
  });

  it('requires a seed for probabilistic collapse', async () => {
    const response = await planetaryRequest(
      makeKernel(),
      planetarySynchronization(
        [planetaryNode('node-a'), planetaryNode('node-b')],
        {},
        { collapsePolicy: 'probabilistic' },
      ),
      'planetary.tick',
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: { code: 'INVALID_PLANETARY_STATE' } });
  });

  it('enforces strict planetary curvature limits', async () => {
    const response = await planetaryRequest(
      makeKernel(),
      planetarySynchronization(
        [planetaryNode('node-a'), planetaryNode('node-b')],
        { globalTruthRules: { curvatureLimit: 0.2 } },
      ),
      'planetary.tick',
    );

    expect(await response.json()).toMatchObject({
      result: {
        state: {
          identities: { 'identity-1': { curvature: 0.2 } },
          quantum: { globalCurvature: 0.2, selectedBranch: { curvature: 0.2 } },
        },
      },
    });
  });

  it('exposes every planetary introspection surface', async () => {
    const kernel = makeKernel();
    const bindings = makeBindings({ kernel });
    await planetaryRequest(
      kernel,
      planetarySynchronization([planetaryNode('node-a'), planetaryNode('node-b')]),
    );
    const paths = ['identity', 'substrate', 'quantum', 'canon', 'governance', 'state'];
    for (const path of paths) {
      const response = await app.request(`/api/introspection/planetary/${path}`, undefined, bindings);
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        ok: true,
        introspection: `planetary.${path}`,
        worker: 'planetary-max',
      });
    }
  });
});

describe('PortalKernel simulation engine', () => {
  it('moves an agent deterministically and emits a reversible diff', async () => {
    const kernel = makeKernel();
    const queued = await simulationRequest(
      kernel,
      '/kernel/sim/event',
      'POST',
      simulationEvent(
        'agent-move-1',
        'agent.move',
        { agentId: 'agent-1', dx: 3, dy: -2, location: { x: 1, y: 4 } },
        1,
        'identity-1',
      ),
    );
    const tick = await simulationRequest(kernel, '/kernel/sim/tick', 'POST');
    const body = await tick.json<{
      result: { snapshot: PortalKernelState; diff: SimTickDiff };
    }>();

    expect(queued.status).toBe(200);
    expect(body.result.snapshot.agents['agent-1']).toMatchObject({
      identityId: 'identity-1',
      location: { x: 4, y: 2 },
      tickVersion: 1,
    });
    expect(body.result.diff.changes[0]).toMatchObject({
      eventId: 'agent-move-1',
      before: null,
      after: { location: { x: 4, y: 2 } },
    });
  });

  it('orders window focus history by event time and id', async () => {
    const kernel = makeKernel();
    await simulationRequest(
      kernel,
      '/kernel/sim/event',
      'POST',
      simulationEvent('window-focus-2', 'window.focus', { windowId: 'window-1', focus: true }, 2, 'identity-1'),
    );
    await simulationRequest(
      kernel,
      '/kernel/sim/event',
      'POST',
      simulationEvent('window-focus-1', 'window.focus', { windowId: 'window-1', focus: false }, 1, 'identity-1'),
    );
    const tick = await simulationRequest(kernel, '/kernel/sim/tick', 'POST');
    const body = await tick.json<{ result: { snapshot: PortalKernelState } }>();
    const window = body.result.snapshot.windows['window-1'];

    expect(window?.focus).toBe(true);
    expect(window?.history.map((event) => event.id)).toEqual(['window-focus-1', 'window-focus-2']);
    expect(window?.ownerIdentityId).toBe('identity-1');
  });

  it('reduces substrate stability after ordered shifts', async () => {
    const kernel = makeKernel();
    await simulationRequest(
      kernel,
      '/kernel/sim/event',
      'POST',
      simulationEvent('substrate-shift-1', 'substrate.shift', { magnitude: 12.5 }, 1),
    );
    const tick = await simulationRequest(kernel, '/kernel/sim/tick', 'POST');
    const body = await tick.json<{ result: { snapshot: PortalKernelState } }>();

    expect(body.result.snapshot.substrate.stability).toBe(87.5);
    expect(body.result.snapshot.substrate.anomalies[0]?.id).toBe('substrate-shift-1');
  });

  it('does not queue or apply a strictly denied event', async () => {
    const kernel = makeKernel('strict');
    const denied = await simulationRequest(kernel, '/kernel/sim/event', 'POST', {
      event: simulationEvent('denied-shift', 'substrate.shift', { magnitude: 50 }, 1),
      governanceContext: { deny: true },
    });
    const deniedBody = await denied.json<{
      error: { code: string };
      meta: { governance: { decision: string; eventId: string } };
    }>();
    await simulationRequest(kernel, '/kernel/sim/tick', 'POST');
    const state = await simulationRequest(kernel, '/kernel/sim/state', 'GET');
    const stateBody = await state.json<{ result: PortalKernelState }>();

    expect(denied.status).toBe(403);
    expect(deniedBody).toMatchObject({
      error: { code: 'FORBIDDEN' },
      meta: { governance: { decision: 'denied', eventId: 'denied-shift' } },
    });
    expect(stateBody.result.substrate.stability).toBe(100);
    expect(stateBody.result.events).toEqual([]);
  });

  it('allows advisory findings while recording the governance decision', async () => {
    const kernel = makeKernel('advisory');
    const response = await simulationRequest(kernel, '/kernel/sim/event', 'POST', {
      event: simulationEvent('advisory-shift', 'substrate.shift', { magnitude: 10 }, 1),
      governanceContext: { deny: true },
    });
    const body = await response.json<{ meta: { governance: { decision: string } } }>();
    await simulationRequest(kernel, '/kernel/sim/tick', 'POST');
    const state = await simulationRequest(kernel, '/kernel/sim/state', 'GET');
    const stateBody = await state.json<{ result: PortalKernelState }>();

    expect(response.status).toBe(200);
    expect(body.meta.governance.decision).toBe('advisory');
    expect(stateBody.result.substrate.stability).toBe(90);
  });

  it('requires and preserves identity binding for agent and window events', async () => {
    const kernel = makeKernel();
    const missing = await simulationRequest(
      kernel,
      '/kernel/sim/event',
      'POST',
      simulationEvent('agent-no-identity', 'agent.move', { agentId: 'agent-1', dx: 1, dy: 1 }, 1),
    );
    const accepted = await simulationRequest(
      kernel,
      '/kernel/sim/event',
      'POST',
      simulationEvent('agent-owner', 'agent.move', { agentId: 'agent-1', dx: 1, dy: 1 }, 1, 'identity-1'),
    );
    const mismatch = await simulationRequest(
      kernel,
      '/kernel/sim/event',
      'POST',
      simulationEvent('agent-other', 'agent.move', { agentId: 'agent-1', dx: 1, dy: 1 }, 2, 'identity-2'),
    );

    expect(missing.status).toBe(400);
    expect(accepted.status).toBe(200);
    expect(mismatch.status).toBe(403);
    expect(await mismatch.json()).toMatchObject({ error: { code: 'IDENTITY_MISMATCH' } });
  });

  it('produces identical snapshots and diffs for the same events', async () => {
    const first = makeKernel();
    const second = makeKernel();
    const events = [
      simulationEvent('move-b', 'agent.move', { agentId: 'agent-1', dx: 2, dy: 0 }, 1, 'identity-1'),
      simulationEvent('move-a', 'agent.move', { agentId: 'agent-1', dx: 0, dy: 3 }, 1, 'identity-1'),
      simulationEvent('focus', 'window.focus', { windowId: 'window-1', focus: true }, 2, 'identity-1'),
    ];
    for (const event of events) {
      await simulationRequest(first, '/kernel/sim/event', 'POST', event);
      await simulationRequest(second, '/kernel/sim/event', 'POST', event);
    }

    const firstTick = await simulationRequest(first, '/kernel/sim/tick', 'POST');
    const secondTick = await simulationRequest(second, '/kernel/sim/tick', 'POST');
    expect(await firstTick.json()).toEqual(await secondTick.json());
  });

  it('handles simulation command and tick message types with simulation metadata', async () => {
    const kernel = makeKernel();
    const command = await kernelRequest(
      kernel,
      envelope('sim.agent.command', {
        event: simulationEvent('command-move', 'agent.move', { agentId: 'agent-1', dx: 2, dy: 1 }, 1),
      }),
    );
    const tick = await kernelRequest(kernel, envelope('sim.agent.tick', { entityId: 'agent-1' }));

    expect(await command.json()).toMatchObject({
      ok: true,
      meta: { sim: { entityId: 'agent-1', kind: 'agent', tickVersion: 0 } },
    });
    expect(await tick.json()).toMatchObject({
      ok: true,
      result: { entity: { id: 'agent-1', location: { x: 2, y: 1 } } },
      meta: { sim: { entityId: 'agent-1', kind: 'agent', tickVersion: 1 } },
    });
  });

  it('progresses TEC tasks deterministically across a tick', async () => {
    const kernel = makeKernel();
    await simulationRequest(
      kernel,
      '/kernel/sim/event',
      'POST',
      simulationEvent('task-create', 'tec.task.created', { taskId: 'task-1' }, 1, 'identity-1'),
    );
    await simulationRequest(
      kernel,
      '/kernel/sim/event',
      'POST',
      simulationEvent('task-complete', 'tec.task.completed', { taskId: 'task-1' }, 2, 'identity-1'),
    );
    await simulationRequest(kernel, '/kernel/sim/tick', 'POST');
    const state = await simulationRequest(kernel, '/kernel/sim/state', 'GET');
    const body = await state.json<{
      result: { tecTasks: Record<string, { status: string; tickVersion: number; identityId: string }> };
    }>();

    expect(body.result.tecTasks['task-1']).toEqual({
      id: 'task-1',
      identityId: 'identity-1',
      status: 'completed',
      tickVersion: 2,
    });
  });

  it('bounds aggregate queued state and per-window history', async () => {
    const storageKernel = makeKernel();
    let storageStatus = 200;
    for (let index = 0; index < 20; index += 1) {
      const response = await simulationRequest(
        storageKernel,
        '/kernel/sim/event',
        'POST',
        simulationEvent(
          `large-layout-${index}`,
          'window.layout.change',
          { windowId: `window-${index}`, layout: { content: 'x'.repeat(60_000) } },
          index,
          'identity-1',
        ),
      );
      storageStatus = response.status;
      if (storageStatus === 429) break;
    }
    expect(storageStatus).toBe(429);

    const historyStorage = new MemoryStorage();
    const existingHistory: ReadonlyArray<SimEvent> = Array.from(
      { length: 200 },
      (_, index: number): SimEvent =>
        simulationEvent(
          `focus-${String(index).padStart(3, '0')}`,
          'window.focus',
          { windowId: 'window-history', focus: index % 2 === 0 },
          index,
          'identity-1',
        ),
    );
    await historyStorage.put('simulation', {
      agents: {},
      windows: {
        'window-history': {
          id: 'window-history',
          ownerIdentityId: 'identity-1',
          focus: false,
          layout: {},
          openSince: 0,
          history: existingHistory,
        },
      },
      substrate: {
        id: 'substrate',
        resources: {},
        topology: {},
        stability: 100,
        anomalies: [],
      },
      events: [],
      tick: 0,
    } satisfies PortalKernelState);
    const historyKernel = makeKernel('strict', historyStorage);
    await simulationRequest(
      historyKernel,
      '/kernel/sim/event',
      'POST',
      simulationEvent(
        'focus-200',
        'window.focus',
        { windowId: 'window-history', focus: true },
        200,
        'identity-1',
      ),
    );
    const tick = await simulationRequest(historyKernel, '/kernel/sim/tick', 'POST');
    const body = await tick.json<{ result: { snapshot: PortalKernelState } }>();
    const history = body.result.snapshot.windows['window-history']?.history;
    expect(history).toHaveLength(200);
    expect(history?.[0]?.id).toBe('focus-001');
    expect(history?.at(-1)?.id).toBe('focus-200');
  });

  it('feeds simulation state into introspection surfaces', async () => {
    const kernel = makeKernel();
    const bindings = makeBindings({ kernel });
    await simulationRequest(
      kernel,
      '/kernel/sim/event',
      'POST',
      simulationEvent('introspection-agent', 'agent.move', { agentId: 'agent-1', dx: 1, dy: 0 }, 1, 'identity-1'),
    );
    await simulationRequest(
      kernel,
      '/kernel/sim/event',
      'POST',
      simulationEvent('introspection-window', 'window.focus', { windowId: 'window-1', focus: true }, 2, 'identity-1'),
    );
    await simulationRequest(
      kernel,
      '/kernel/sim/event',
      'POST',
      simulationEvent('introspection-shift', 'substrate.shift', { magnitude: 5 }, 3),
    );
    await simulationRequest(kernel, '/kernel/sim/tick', 'POST');

    const behavior = await app.request('/api/introspection/sim/behavior', undefined, bindings);
    const windows = await app.request('/api/introspection/windows/state', undefined, bindings);
    const timeline = await app.request('/api/introspection/windows/timeline', undefined, bindings);
    const substrate = await app.request('/api/introspection/substrate/state', undefined, bindings);
    const messages = await app.request('/api/introspection/messages', undefined, bindings);
    const inference = await app.request('/api/introspection/inference', undefined, bindings);
    const quantumState = await app.request('/api/introspection/quantum/state', undefined, bindings);
    const quantumBranches = await app.request('/api/introspection/quantum/branches', undefined, bindings);
    const quantumCurvature = await app.request('/api/introspection/quantum/curvature', undefined, bindings);
    const quantumSignature = await app.request('/api/introspection/quantum/signature', undefined, bindings);

    expect(await behavior.json()).toMatchObject({ result: { activeAgents: 1, anomalies: 1, tick: 1 } });
    expect(await windows.json()).toMatchObject({ result: [{ id: 'window-1', focus: true }] });
    expect(await timeline.json()).toMatchObject({ result: [{ id: 'introspection-window' }] });
    expect(await substrate.json()).toMatchObject({ result: { stability: 95 } });
    const messageBody = await messages.json<{ result: ReadonlyArray<{ id: string }> }>();
    expect(messageBody.result.map((event) => event.id)).toEqual([
      'introspection-agent',
      'introspection-window',
      'introspection-shift',
    ]);
    expect(await inference.json()).toMatchObject({
      result: {
        facts: expect.arrayContaining([
          expect.objectContaining({ id: 'fact:event:introspection-agent', kind: 'agent' }),
          expect.objectContaining({ id: 'fact:event:introspection-window', kind: 'window' }),
          expect.objectContaining({ id: 'fact:event:introspection-shift', kind: 'substrate' }),
        ]),
        hypotheses: expect.any(Array),
        recommendations: expect.any(Array),
      },
    });
    expect(await quantumState.json()).toMatchObject({
      result: { collapsePolicy: 'deterministic', branches: expect.any(Array) },
    });
    expect(await quantumBranches.json()).toMatchObject({
      result: expect.arrayContaining([
        expect.objectContaining({ probability: expect.any(Number), signature: expect.stringMatching(/^MAX-/) }),
      ]),
    });
    expect(await quantumCurvature.json()).toMatchObject({ result: { 'identity-1': expect.any(Number) } });
    expect(await quantumSignature.json()).toMatchObject({
      result: expect.arrayContaining([
        expect.objectContaining({ id: expect.stringMatching(/^MAX-/), influence: { 'identity-1': expect.any(Number) } }),
      ]),
    });
  });
});

describe('PortalKernel Durable Object', () => {
  it('reports DO health for non-message routes', async () => {
    const response = await makeKernel().fetch(new Request('https://kernel.test/health'));
    expect(await response.json()).toEqual({ status: 'ok', service: 'portal-kernel' });
  });

  it('rejects invalid JSON envelopes', async () => {
    const response = await kernelRequest(makeKernel(), '{', true);
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'INVALID_JSON' } });
  });

  it('rejects incomplete envelopes', async () => {
    const response = await kernelRequest(makeKernel(), { type: 'sim.step' });
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'INVALID_MESSAGE' } });
  });

  it('dispatches a general kernel operation', async () => {
    const response = await kernelRequest(makeKernel(), envelope('sim.step'));
    expect(await response.json()).toMatchObject({
      ok: true,
      lanes: [{ name: 'kernel' }],
      data: { operation: 'sim.step', accepted: true },
    });
  });

  it('returns deterministic envelope-bound introspection snapshots', async () => {
    const response = await kernelRequest(makeKernel(), envelope('introspection.sim.behavior'));
    expect(await response.json()).toMatchObject({
      result: {
        kind: 'sim.behavior',
        messageId: 'message-introspection.sim.behavior',
        scope: 'portal-kernel',
      },
    });
  });

  it('returns an initial universe state without mutating storage', async () => {
    const response = await kernelRequest(makeKernel(), envelope('universe.state'));
    expect(await response.json()).toMatchObject({ data: { tick: 0, properties: {}, lastOperation: null } });
  });

  it('sorts and persists deterministic tick changes', async () => {
    const kernel = makeKernel();
    const tick = await kernelRequest(kernel, envelope('universe.tick', { changes: { zeta: 1, alpha: 2 } }));
    const state = await kernelRequest(kernel, envelope('universe.state'));
    expect(await tick.json()).toMatchObject({ data: { tick: 1, properties: { alpha: 2, zeta: 1 } } });
    expect(await state.json()).toMatchObject({ data: { tick: 1, properties: { alpha: 2, zeta: 1 } } });
  });

  it('adds numeric deltas on successive ticks', async () => {
    const kernel = makeKernel();
    await kernelRequest(kernel, envelope('universe.tick', { changes: { population: 5 } }));
    const response = await kernelRequest(kernel, envelope('universe.tick', { changes: { population: -2 } }));
    expect(await response.json()).toMatchObject({ data: { tick: 2, properties: { population: 3 } } });
  });

  it('denies governance violations in strict mode', async () => {
    const response = await kernelRequest(makeKernel('strict'), envelope('sim.step', {}, { deny: true }));
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ meta: { governance: { mode: 'strict', decision: 'denied' } } });
  });

  it('returns governance deltas in advisory mode', async () => {
    const value = envelope('sim.step', { structuralTruth: false }, { deny: true });
    const response = await kernelRequest(makeKernel('advisory'), value);
    const result = await response.json<{ meta: { governance: { decision: string; deltas: unknown[] } } }>();
    expect(result.meta.governance.decision).toBe('advisory');
    expect(result.meta.governance.deltas).toHaveLength(2);
  });

  it('bypasses governance rules in off mode', async () => {
    const value = envelope('sim.step', { structuralTruth: false }, { deny: true });
    const response = await kernelRequest(makeKernel('off'), value);
    expect(await response.json()).toMatchObject({ ok: true, meta: { governance: { mode: 'off', decision: 'bypassed' } } });
  });

  it('enforces lane access policy', async () => {
    const response = await kernelRequest(
      makeKernel('strict'),
      envelope('identity.physics.license', {}, { allowedLanes: ['universe'] }),
    );
    expect(await response.json()).toMatchObject({ ok: false, error: { code: 'FORBIDDEN' } });
  });

  it('emits the required umbrella OS lane shape', async () => {
    const value = envelope('umbrella.os', { permissions: { deploy: true } });
    const raw = await kernelRequest(makeKernel(), value);
    const result = await readKernelResult(raw, value, 'PortalKernel');
    expect(result).toMatchObject({
      ok: true,
      result: {
        osPermissions: { deploy: true },
        osIdentity: {},
        osGovernanceFlags: {},
        osTruthInvariants: {},
      },
      meta: { umbrella: 'os-update' },
    });
  });
});
