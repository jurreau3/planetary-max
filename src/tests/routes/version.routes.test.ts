import { describe, expect, it } from 'vitest';
import { assertVersion } from '../utils/assert';
import { expectJSON } from '../utils/expectJSON';
import { run } from '../utils/run';

describe('version route', () => {
  it('returns 200 and the version response', async () => {
    const response = await run('/api/version/read');
    expect(response.status).toBe(200);
    assertVersion(await expectJSON(response));
  });
});
