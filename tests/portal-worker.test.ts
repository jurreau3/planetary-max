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
          lane: 'windows',
          data: { surface: 'windows', windows: [] },
          meta: { id: 'worker-ok', phase: '11' },
        }),
    }),
  },
};

describe('portal worker stable routes', () => {
  it('responds to the root surface and health checks', async () => {
    const root = await app.request('/', {}, bindings as any);
    const health = await app.request('/health', {}, bindings as any);

    expect(root.status).toBe(200);
    expect(await root.json()).toMatchObject({ ok: true, service: 'planetary-max' });
    expect(health.status).toBe(200);
    expect(await health.json()).toMatchObject({ ok: true, service: 'planetary-max' });
  });

  it('normalizes a valid task through the stable lane contract', async () => {
    const response = await app.request(
      '/api/kernel/message',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer operator', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'portal-1', lane: 'windows', payload: { windowId: 'w-1' } }),
      },
      bindings as any,
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      ok: true,
      lane: 'windows',
      data: { surface: 'windows' },
    });
  });
});
