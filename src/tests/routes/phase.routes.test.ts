import { describe, expect, it } from 'vitest';
import { assertPhase } from '../utils/assert';
import { expectJSON } from '../utils/expectJSON';
import { run } from '../utils/run';

describe('phase route', () => {
  it('returns 200 and the phase response', async () => {
    const response = await run('/api/phase/status');
    expect(response.status).toBe(200);
    assertPhase(await expectJSON(response));
  });
});
