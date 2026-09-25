import { describe, it, expect } from 'vitest';
import app from './index';
import { assertKernel, assertPhase, assertState, assertUmbrella, assertPlanetaryMode, assertVersion } from './tests/assertions';

async function json(path: string, init?: RequestInit) {
  const response = await app.request(path, init);
  expect(response.status).toBe(200);
  expect(response.headers.get('Content-Type')).toContain('application/json');
  return response.json();
}

describe('Portal-OS JSON contracts', () => {
  it('validates all shared response schemas', async () => {
    assertKernel(await json('/api/kernel/status'));
    assertState(await json('/api/state/read'));
    assertUmbrella(await json('/api/umbrella/status'));
    assertPhase(await json('/api/phase/status'));
    assertPlanetaryMode(await json('/api/planetary/mode'));
    assertPlanetaryMode(await json('/api/planetary/toggle', { method: 'POST' }));
    assertVersion(await json('/api/version/read'));
  });
});
