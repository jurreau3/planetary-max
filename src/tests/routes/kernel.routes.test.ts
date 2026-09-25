import { describe, expect, it } from 'vitest';
import { assertKernel } from '../utils/assert';
import { expectJSON } from '../utils/expectJSON';
import { run } from '../utils/run';

describe('kernel route', () => {
  it('returns 200 and the kernel response', async () => {
    const response = await run('/api/kernel/status');
    expect(response.status).toBe(200);
    assertKernel(await expectJSON(response));
  });
});
