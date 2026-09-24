export type StableWindow = { id: string; state: 'ready' };

export function windowsEnvelope(): { ok: true; windows: StableWindow[] } {
  return { ok: true, windows: [] };
}
