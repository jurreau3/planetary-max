import type { JsonObject } from './contracts';

/**
 * windowsEnvelope
 *
 * Public read‑only view of the window manager state.
 * Used by /windows and introspection routes.
 */
export function windowsEnvelope(): JsonObject {
  return {
    ok: true,
    service: 'WINDOWS',
    version: 1,
    manager: {
      active: true,
      focused: null,
      layout: {
        mode: 'floating',
        windows: [],
      },
      timeline: [],
    },
  };
}

/**
 * portalEnvelope
 *
 * Public view of the Portal surface state.
 * (Not currently used directly, but available for future expansion.)
 */
export function portalEnvelope(): JsonObject {
  return {
    ok: true,
    service: 'PORTAL',
    version: 1,
    surface: {
      active: true,
      windows: [],
      timeline: [],
    },
  };
}

/**
 * simEnvelope
 *
 * Public view of the simulation state.
 * (beeSimEnvelope lives in planetary.ts, but this is the generic type.)
 */
export function simEnvelope(): JsonObject {
  return {
    ok: true,
    service: 'SIM',
    version: 1,
    state: {
      mode: 'planetary',
      tick: 0,
      signals: {},
    },
  };
}

/**
 * umbrellaEnvelope
 *
 * Public view of governance state.
 * (governanceEnvelope lives in governance.ts, but this is the generic type.)
 */
export function umbrellaEnvelope(): JsonObject {
  return {
    ok: true,
    service: 'UMBRELLA',
    version: 1,
    governance: {
      mode: 'strict',
      enforcement: {
        identity: true,
        roles: true,
        permissions: true,
        lanes: true,
        kernelCoherence: true,
        planetaryConsistency: true,
      },
      signals: {
        integrity: 1,
        coherence: 1,
        governanceActive: true,
      },
    },
  };
}
