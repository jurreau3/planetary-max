import { describe, expect, it } from 'vitest';
import { assertVersion } from './assertions';
import { expectJSON, run } from './helpers';

describe('Version route', () => {
  it('returns the shared VersionRead contract', async () => {
    const response = await run('/api/version/read');
    expect(response.status).toBe(200);
    const json = await expectJSON(response);
    assertVersion(json);
  });
});
