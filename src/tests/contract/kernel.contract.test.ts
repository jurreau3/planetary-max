import { describe, expect, it } from 'vitest';
import { assertKernel, assertPhase, assertState, assertUmbrella, assertPlanetary, assertVersion } from '../utils/assert';
import { expectJSON } from '../utils/expectJSON';
import { run } from '../utils/run';

describe('kernel contract', () => {
  it('matches the kernel status schema', async () => {
    const response = await run('/api/kernel/status');
    expect(response.status).toBe(200);
    assertKernel(await expectJSON(response));
  });
});

describe('state contract', () => {
  it('matches the state read schema', async () => {
    const response = await run('/api/state/read');
    expect(response.status).toBe(200);
    assertState(await expectJSON(response));
  });
});

describe('umbrella contract', () => {
  it('matches the umbrella status schema', async () => {
    const response = await run('/api/umbrella/status');
    expect(response.status).toBe(200);
    assertUmbrella(await expectJSON(response));
  });
});

describe('phase contract', () => {
  it('matches the phase status schema', async () => {
    const response = await run('/api/phase/status');
    expect(response.status).toBe(200);
    assertPhase(await expectJSON(response));
  });
});

describe('planetary contract', () => {
  it('matches the planetary mode schema', async () => {
    const mode = await run('/api/planetary/mode');
    expect(mode.status).toBe(200);
    assertPlanetary(await expectJSON(mode));

    const toggled = await run('/api/planetary/toggle', { method: 'POST' });
    expect(toggled.status).toBe(200);
    assertPlanetary(await expectJSON(toggled));
  });
});

describe('version contract', () => {
  it('matches the version schema', async () => {
    const response = await run('/api/version/read');
    expect(response.status).toBe(200);
    assertVersion(await expectJSON(response));
  });
});
