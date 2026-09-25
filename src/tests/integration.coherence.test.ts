import { describe, expect, it } from 'vitest';
import { assertKernel, assertPhase, assertState } from './assertions';
import { expectJSON, run } from './helpers';

describe('Portal-OS cross-route coherence', () => {
  it('keeps phase, state, and kernel responses coherent', async () => {
    const kernel = await expectJSON(await run('/api/kernel/status'));
    const state = await expectJSON(await run('/api/state/read'));
    const phase = await expectJSON(await run('/api/phase/status'));

    assertKernel(kernel);
    assertState(state);
    assertPhase(phase);
    expect(state.state.phase).toBe(phase.phase);
    expect(kernel.kernelMode).toBeDefined();
  });

  it('reflects planetary toggles in subsequent reads', async () => {
    const before = await expectJSON<{ mode: string }>(await run('/api/planetary/mode'));
    const toggled = await expectJSON<{ mode: string }>(await run('/api/planetary/toggle', { method: 'POST' }));
    const after = await expectJSON<{ mode: string }>(await run('/api/planetary/mode'));

    expect(toggled.mode).not.toBe(before.mode);
    expect(after.mode).toBe(toggled.mode);
  });
});
