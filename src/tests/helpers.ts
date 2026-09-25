import { expect } from 'vitest';
import app from '../index';

export function run(path: string, init?: RequestInit) {
  return app.request(path, init);
}

export async function expectJSON<T = unknown>(response: Response): Promise<T> {
  expect(response.headers.get('Content-Type')).toContain('application/json');
  return response.json() as Promise<T>;
}
