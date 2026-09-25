import { describe, expect, it } from 'vitest';

import { app } from './index';

const bindings = {
  PLANETARY_MODE: 'single',
  UMBRELLA_ENFORCEMENT: 'strict',
  PORTAL_KERNEL: {
    idFromName: () => ({}) as DurableObjectId,
    get: () => ({
      fetch: async () =>
        Response.json({
          ok: true,
          lane: 'sim',
          data: { accepted: true },
          meta: { id: 'kernel-message', phase: '11' },
        }),
    }),
  },
};

describe('Phase-11 stable worker surfaces', () => {
  it('serves the stable root banner', async () => {
    const response = await app.request('/', {}, bindings as any);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      service: 'planetary-max',
      phase: '11',
    });
  });

  it('serves the worker health surface', async () => {
    const response = await app.request('/health', {}, bindings as any);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, service: 'planetary-max' });
  });

  it('allows cross-origin requests and handles preflight requests', async () => {
    const response = await app.request('/health', {
      headers: { Origin: 'https://dashboard.example.com' },
    }, bindings as any);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');

    const preflight = await app.request('/api/kernel/message', {
      method: 'OPTIONS',
      headers: {
        Origin: 'https://dashboard.example.com',
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'Content-Type, Authorization',
      },
    }, bindings as any);
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(preflight.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
    expect(preflight.headers.get('Access-Control-Allow-Headers')).toContain('Authorization');
  });

  it('rejects malformed JSON before it reaches the kernel bridge', async () => {
    const response = await app.request(
      '/api/kernel/message',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' },
      bindings as any,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_JSON' },
    });
  });

  it('accepts a valid stable lane envelope', async () => {
    const response = await app.request(
      '/api/kernel/message',
      {
        method: 'POST',
        headers: {
          Authorization: 'Bearer operator',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ id: 'kernel-message', lane: 'sim', payload: { ok: true } }),
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

  it('rejects invalid stable lane payloads', async () => {
    const response = await app.request(
      '/api/kernel/message',
      {
        method: 'POST',
        headers: { Authorization: 'Bearer operator', 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: 'bad', payload: {} }),
      },
      bindings as any,
    );

    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({
      ok: false,
      error: { code: 'INVALID_LANE' },
    });
  });
});
