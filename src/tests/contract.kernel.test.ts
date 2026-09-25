import { describe, expect, it } from 'vitest';
import { assertKernel } from './assertions';
import { expectJSON, run } from './helpers';

describe('Kernel route', () => {
  it('exists and returns the shared KernelStatus contract', async () => {
    const response = await run('/api/kernel/status');
    expect(response.status).toBe(200);
    const json = await expectJSON(response);
    assertKernel(json);
  });
});
