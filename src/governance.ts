export type UmbrellaMode = 'strict' | 'advisory' | 'off';

export const MAX_RETRY_ATTEMPTS = 3;
export const RETRY_BASE_DELAY_MS = 50;
export const CIRCUIT_FAILURE_THRESHOLD = 5;
export const CIRCUIT_COOLDOWN_MS = 30_000;

export function umbrellaMode(value: string | undefined): UmbrellaMode {
  return value === 'advisory' || value === 'off' ? value : 'strict';
}

export function allowEnvelope(lane: string, mode: UmbrellaMode): boolean {
  if (mode === 'off' || mode === 'advisory') return true;
  return lane === 'identity' || lane === 'windows' || lane === 'sim' || lane === 'umbrella';
}

export function governanceEnvelope(mode: UmbrellaMode): Record<string, unknown> {
  return { mode, enforcement: 'strict', allowed: true, phase: '11' };
}
