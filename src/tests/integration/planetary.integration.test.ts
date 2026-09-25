import { describe, expect, it } from 'vitest';
import { assertPlanetary } from '../utils/assert';
import { expectJSON } from '../utils/expectJSON';
import { run } from '../utils/run';

describe('planetary integration', () => {
  it('returns a stable mode payload on read and write', async () => {
    const mode = await expectJSON<{ mode: string }>(await run('/api/planetary/mode'));
    const toggled = await expectJSON<{ mode: string }>(await run('/api/planetary/toggle', { method: 'POST' }));

    assertPlanetary(mode);
    assertPlanetary(toggled);
    expect(toggled.mode).toBeDefined();
    expect(mode.mode).not.toBeUndefined();
  });
});
