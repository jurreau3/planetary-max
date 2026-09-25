import { describe, expect, it } from 'vitest';
import { assertPlanetary } from '../utils/assert';
import { expectJSON } from '../utils/expectJSON';
import { run } from '../utils/run';

describe('planetary routes', () => {
  it('returns the planetary mode', async () => {
    const response = await run('/api/planetary/mode');
    expect(response.status).toBe(200);
    assertPlanetary(await expectJSON(response));
  });
  it('toggles the planetary mode', async () => {
    const response = await run('/api/planetary/toggle', { method: 'POST' });
    expect(response.status).toBe(200);
    assertPlanetary(await expectJSON(response));
  });
});
