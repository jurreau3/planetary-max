import { describe, it, expect } from 'vitest';
import app from './index';

function run(path: string, init?: RequestInit) {
  return app.request(path, init);
}

async function expectJSON(res: Response) {
  expect(res.headers.get('Content-Type')).toContain('application/json');
  return await res.json();
}

describe('Portal-OS Integration Suite', () => {
  const routes = [
    '/api/kernel/status',
    '/api/state/read',
    '/api/umbrella/status',
    '/api/phase/status',
    '/api/planetary/mode',
    '/api/version/read',
  ];

  routes.forEach((route) => {
    it(`GET ${route} -> exists and returns 200`, async () => {
      const res = await run(route);
      expect(res.status).toBe(200);
    });
  });

  it('POST /api/planetary/toggle -> exists and returns 200', async () => {
    expect((await run('/api/planetary/toggle', { method: 'POST' })).status).toBe(200);
  });

  it('validates the JSON contracts', async () => {
    const kernel = await expectJSON(await run('/api/kernel/status'));
    expect(kernel).toMatchObject({ status: 'ready', tick: 0, signals: [], kernelMode: expect.any(String) });

    const state = await expectJSON(await run('/api/state/read'));
    expect(state.state).toMatchObject({
      identity: expect.any(Object),
      runtime: expect.any(Object),
      planetary: expect.any(Object),
      phase: expect.any(String),
    });

    const umbrella = await expectJSON(await run('/api/umbrella/status'));
    expect(Array.isArray(umbrella.rules)).toBe(true);
    expect(umbrella).toMatchObject({ active: true, lastUpdate: expect.any(String) });

    const phase = await expectJSON(await run('/api/phase/status'));
    expect(phase).toMatchObject({ phase: '11', coherence: true, signals: [] });

    const mode = await expectJSON(await run('/api/planetary/mode'));
    expect(typeof mode.mode).toBe('string');

    const version = await expectJSON(await run('/api/version/read'));
    expect(version).toMatchObject({ version: expect.any(String), build: expect.any(String), commit: expect.any(String) });
  });

  it('supports CORS preflight', async () => {
    const res = await run('/api/kernel/status', { method: 'OPTIONS' });
    expect(res.status).toBe(200);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(res.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(res.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
  });

  it('rejects GET on the toggle route and unknown routes', async () => {
    expect([400, 404, 405]).toContain((await run('/api/planetary/toggle')).status);
    expect((await run('/api/does-not-exist')).status).toBe(404);
  });

  it('keeps planetary mode coherent across toggle and read operations', async () => {
    const before = await expectJSON(await run('/api/planetary/mode'));
    const toggled = await expectJSON(await run('/api/planetary/toggle', { method: 'POST' }));
    const after = await expectJSON(await run('/api/planetary/mode'));
    expect(toggled.mode).not.toBe(before.mode);
    expect(after.mode).toBe(toggled.mode);
  });

  it('keeps phase/state/kernel responses coherent', async () => {
    const kernel = await expectJSON(await run('/api/kernel/status'));
    const state = await expectJSON(await run('/api/state/read'));
    const phase = await expectJSON(await run('/api/phase/status'));
    expect(state.state.phase).toBe(phase.phase);
    expect(kernel.kernelMode).toBeDefined();
  });
});
