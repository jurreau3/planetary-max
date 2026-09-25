import { expect } from 'vitest';

export async function expectJSON<T = unknown>(response: Response): Promise<T> {
  expect(response.headers.get('content-type')).toContain('application/json');
  return response.json() as Promise<T>;
}
