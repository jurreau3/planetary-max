const API_BASE = 'https://planetary-max.maxchaz1.workers.dev/api';

type ApiRequest = (path: string) => Promise<unknown>;

const get: ApiRequest = async (path) => {
  const response = await fetch(`${API_BASE}${path}`);
  if (!response.ok) throw new Error(`API request failed (${response.status})`);
  return response.json();
};

export const api = {
  kernel: { status: () => get('/kernel/status') },
  state: { read: () => get('/state') },
  umbrella: { status: () => get('/umbrella/status') },
};

export { API_BASE };
