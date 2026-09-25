import { describe, expect, it } from 'vitest';
import { assertKernel, assertPhase, assertState } from '../utils/assert';
import { expectJSON } from '../utils/expectJSON';
import { run } from '../utils/run';

describe('portal-os cross-route coherence', () => {
  it('keeps kernel, state, and phase values coherent', async () => {
    const kernel = await expectJSON(await run('/api/kernel/status'));
    const state = await expectJSON(await run('/api/state/read'));
    const phase = await expectJSON(await run('/api/phase/status'));

    assertKernel(kernel);
    assertState(state);
    assertPhase(phase);

    expect(state.state.phase).toBe(phase.phase);
    expect(kernel.kernelMode).toBeDefined();
  });

  it('reflects toggles in later reads', async () => {
    const before = await expectJSON<{ mode: string }>(await run('/api/planetary/mode'));
    const toggled = await expectJSON<{ mode: string }>(await run('/api/planetary/toggle', { method: 'POST' }));
    const after = await expectJSON<{ mode: string }>(await run('/api/planetary/mode'));

    expect(toggled.mode).not.toBe(before.mode);
    expect(after.mode).toBe(toggled.mode);
  });
});
