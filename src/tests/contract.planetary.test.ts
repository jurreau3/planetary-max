import { describe, expect, it } from 'vitest';
import { assertPlanetaryMode } from './assertions';
import { expectJSON, run } from './helpers';

describe('Planetary routes', () => {
  it('returns the shared PlanetaryMode contract', async () => {
    const response = await run('/api/planetary/mode');
    expect(response.status).toBe(200);
    const json = await expectJSON(response);
    assertPlanetaryMode(json);
  });

  it('toggles and returns the shared PlanetaryMode contract', async () => {
    const response = await run('/api/planetary/toggle', { method: 'POST' });
    expect(response.status).toBe(200);
    const json = await expectJSON(response);
    assertPlanetaryMode(json);
  });
});
