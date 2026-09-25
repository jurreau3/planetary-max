import app from '../../index';

export function run(path: string, init?: RequestInit) {
  return app.request(path, init);
}
