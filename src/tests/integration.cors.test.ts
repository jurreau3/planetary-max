import { describe, expect, it } from 'vitest';
import { run } from './helpers';

describe('Portal-OS CORS integration', () => {
  it('supports the global OPTIONS preflight contract', async () => {
    const response = await run('/api/kernel/status', { method: 'OPTIONS' });
    expect(response.status).toBe(200);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('OPTIONS');
    expect(response.headers.get('Access-Control-Allow-Headers')).toContain('Content-Type');
  });
});
