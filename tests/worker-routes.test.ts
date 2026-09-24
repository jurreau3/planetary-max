import { describe, expect, it } from 'vitest';

import { app } from '../src/index';

const bindings = {
  PLANETARY_MODE: 'single',
  UMBRELLA_ENFORCEMENT: 'strict',
  PORTAL_KERNEL: {
    idFromName: () => ({}) as DurableObjectId,
    get: () => ({
      fetch: async () =>
        Response.json({
          ok: true,
          lane: 'identity',
          data: { surface: 'identity', authenticated: true },
          meta: { id: 'bridge-ok', phase: '11' },
        }),
    }),
  },
};

describe('stable worker routes', () => {
  it('exposes the Phase-11 root and health surfaces', async () => {
    const root = await app.request('/', {}, bindings as any);
    const health = await app.request('/health', {}, bindings as any);

    expect(root.status).toBe(200);
    expect(await root.json()).toMatchObject({ ok: true, service: 'planetary-max' });
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, service: 'planetary-max' });
  });

  it('accepts a worker kernel request on the stable lane envelope', async () => {
    const response = await app.request(
      '/api/kernel/message',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer operator', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'route-1', lane: 'sim', payload: { tick: 1 } }),
      },
      bindings as any,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      lane: 'sim',
      data: { accepted: true },
    });
  });
});
