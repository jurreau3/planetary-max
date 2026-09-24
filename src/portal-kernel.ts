import type { Bindings, KernelEnvelope, KernelResult } from './contracts';
import { allowEnvelope, umbrellaMode } from './governance';
import { asJsonObject } from './contracts';

export class PortalKernel {
  constructor(
    private readonly state: DurableObjectState,
    private readonly env: Pick<Bindings, 'PORTAL_OS_PHASE' | 'UMBRELLA_ENFORCEMENT'>,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/api/kernel/message') {
      return Response.json({ ok: true, service: 'PortalKernel', phase: this.env.PORTAL_OS_PHASE ?? '11' });
    }
    let value: unknown;
    try { value = await request.json(); } catch {
      return Response.json({ ok: false, error: { code: 'INVALID_JSON', message: 'Kernel envelope must be JSON' } }, { status: 400 });
    }
    if (!isEnvelope(value)) {
      return Response.json({ ok: false, error: { code: 'INVALID_ENVELOPE', message: 'Stable kernel envelope required' } }, { status: 400 });
    }
    const mode = umbrellaMode(this.env.UMBRELLA_ENFORCEMENT);
    if (!allowEnvelope(value.lane, mode)) {
      return Response.json({ ok: false, error: { code: 'FORBIDDEN', message: 'Envelope denied by umbrella governance' } }, { status: 403 });
    }
    const data = await dispatch(value, this.state.storage);
    const result: KernelResult = { ok: true, lane: value.lane, data, meta: { id: value.id, phase: '11' } };
    return Response.json(result);
  }
}

async function dispatch(envelope: KernelEnvelope, storage: DurableObjectStorage): Promise<Record<string, unknown>> {
  switch (envelope.lane) {
    case 'identity': return { surface: 'identity', authenticated: envelope.identity !== 'anonymous' };
    case 'windows': return { surface: 'windows', windows: [] };
    case 'sim':
      await storage.put('sim:last', envelope.payload);
      return { surface: 'sim', placeholder: true, accepted: true };
    case 'umbrella': return { surface: 'umbrella', accepted: true, policy: 'strict' };
  }
}

function isEnvelope(value: unknown): value is KernelEnvelope {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return typeof candidate.id === 'string' && typeof candidate.lane === 'string' &&
    ['identity', 'windows', 'sim', 'umbrella'].includes(candidate.lane) &&
    typeof candidate.identity === 'string' && typeof candidate.payload === 'object' && candidate.payload !== null;
}

export default PortalKernel;
