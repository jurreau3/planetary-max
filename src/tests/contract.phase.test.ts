import { describe, expect, it } from 'vitest';
import { assertPhase } from './assertions';
import { expectJSON, run } from './helpers';

describe('Phase route', () => {
  it('returns the shared PhaseStatus contract', async () => {
    const response = await run('/api/phase/status');
    expect(response.status).toBe(200);
    const json = await expectJSON(response);
    assertPhase(json);
  });
});
