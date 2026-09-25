import { describe, expect, it } from 'vitest';
import { assertState } from './assertions';
import { expectJSON, run } from './helpers';

describe('State route', () => {
  it('returns the shared StateRead contract', async () => {
    const response = await run('/api/state/read');
    expect(response.status).toBe(200);
    const json = await expectJSON(response);
    assertState(json);
  });
});
