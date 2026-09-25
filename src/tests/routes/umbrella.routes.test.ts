import { describe, expect, it } from 'vitest';
import { assertUmbrella } from '../utils/assert';
import { expectJSON } from '../utils/expectJSON';
import { run } from '../utils/run';

describe('umbrella route', () => {
  it('returns 200 and the umbrella response', async () => {
    const response = await run('/api/umbrella/status');
    expect(response.status).toBe(200);
    assertUmbrella(await expectJSON(response));
  });
});
