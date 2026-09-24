export type PlanetaryEnvelope = {
  ok: true;
  service: 'MAX-OS-1';
  version: '1';
  mode: 'active';
  surface: 'sim';
  placeholder: true;
};

export function beeSimEnvelope(): PlanetaryEnvelope {
  return {
    ok: true,
    service: 'MAX-OS-1',
    version: '1',
    mode: 'active',
    surface: 'sim',
    placeholder: true,
  };
}
