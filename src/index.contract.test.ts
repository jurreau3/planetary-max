import { describe, it, expect } from 'vitest';
import app from '../../index';
import { assertKernel, assertPhase, assertState, assertUmbrella, assertPlanetary, assertVersion } from '../utils/assert';

async function json(path: string, init?: RequestInit) {
  const response = await app.request(path, init);
  expect(response.status).toBe(200);
  return response.json();
}

describe('portal-os json contracts', () => {
  it('validates all shared response schemas', async () => {
    assertKernel(await json('/api/kernel/status'));
    assertState(await json('/api/state/read'));
    assertUmbrella(await json('/api/umbrella/status'));
    assertPhase(await json('/api/phase/status'));
    assertPlanetary(await json('/api/planetary/mode'));
    assertPlanetary(await json('/api/planetary/toggle', { method: 'POST' }));
    assertVersion(await json('/api/version/read'));
  });
});
