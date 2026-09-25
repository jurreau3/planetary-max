import { describe, expect, it } from 'vitest';
import { assertState } from '../utils/assert';
import { expectJSON } from '../utils/expectJSON';
import { run } from '../utils/run';

describe('state route', () => {
  it('returns 200 and the state response', async () => {
    const response = await run('/api/state/read');
    expect(response.status).toBe(200);
    assertState(await expectJSON(response));
  });
});
