import { describe, expect, it } from 'vitest';
import { run } from '../utils/run';

describe('portal-os route integration', () => {
  const routes = [
    '/api/kernel/status',
    '/api/state/read',
    '/api/umbrella/status',
    '/api/phase/status',
    '/api/planetary/mode',
    '/api/version/read',
  ];

  for (const route of routes) {
    it(`GET ${route} returns 200`, async () => {
      expect((await run(route)).status).toBe(200);
    });
  }

  it('rejects unsupported methods and routes', async () => {
    expect([400, 404, 405]).toContain((await run('/api/planetary/toggle')).status);
    expect((await run('/api/does-not-exist')).status).toBe(404);
    expect([400, 405]).toContain((await run('/api/kernel/status', { method: 'POST' })).status);
  });
});
