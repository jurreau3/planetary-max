import { describe, expect, it } from 'vitest';

import PortalKernel from './portal-kernel';

describe('PortalKernel stable surface', () => {
  const makeKernel = () =>
    new PortalKernel(
      { storage: { get: async () => undefined, put: async () => undefined } } as unknown as DurableObjectState,
      { PORTAL_OS_PHASE: '11', UMBRELLA_ENFORCEMENT: 'strict' },
    );

  it('exposes a health response for non-message requests', async () => {
    const response = await makeKernel().fetch(new Request('https://kernel.test/health'));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: 'PortalKernel',
      phase: '11',
    });
  });

  it('accepts a stable identity lane message', async () => {
    const response = await makeKernel().fetch(
      new Request('https://kernel.test/api/kernel/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'm-1', lane: 'identity', payload: { ok: true }, identity: 'operator' }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      lane: 'identity',
      data: { surface: 'identity', authenticated: true },
    });
  });

  it('rejects malformed envelopes without a lane', async () => {
    const response = await makeKernel().fetch(
      new Request('https://kernel.test/api/kernel/message', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'bad', payload: {} }),
      }),
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_ENVELOPE' },
    });
  });
});
