const API_BASE = 'https://planetary-max.maxchaz1.workers.dev/api';

type ApiRequest = (path: string) => Promise<unknown>;
type ApiPostRequest = (path: string, body?: unknown) => Promise<unknown>;

const get: ApiRequest = async (path) => {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json();
};

const post: ApiPostRequest = async (path, body) => {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json();
};

export const api = {
  kernel: {
    status: () => get('/kernel/status'),
  },
  state: {
    read: () => get('/state/read'),
  },
  umbrella: {
    status: () => get('/umbrella/status'),
  },
  phase: {
    status: () => get('/phase/status'),
  },
  planetary: {
    mode: () => get('/planetary/mode'),
    toggle: () => post('/planetary/toggle'),
  },
  version: {
    read: () => get('/version/read'),
  },
};

export { API_BASE };
