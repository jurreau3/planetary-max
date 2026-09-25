import type { JsonObject } from './contracts';

/**
 * beeSimEnvelope
 *
 * Returns a lightweight planetary / simulation envelope for the /sim route.
 * This is the public, read‑only view of the planetary simulation state.
 */
export function beeSimEnvelope(): JsonObject {
  return {
    ok: true,
    service: 'MAX-SIM',
    mode: 'planetary',
    topology: {
      kind: 'bee-sim',
      version: 1,
    },
    state: {
      swarm: {
        active: true,
        count: 0,
      },
      environment: {
        weather: 'clear',
        field: 'default',
      },
    },
  };
}
