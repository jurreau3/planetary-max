import { describe, expect, it } from 'vitest';
import { assertUmbrella } from './assertions';
import { expectJSON, run } from './helpers';

describe('Umbrella route', () => {
  it('returns the shared UmbrellaStatus contract', async () => {
    const response = await run('/api/umbrella/status');
    expect(response.status).toBe(200);
    const json = await expectJSON(response);
    assertUmbrella(json);
  });
});
