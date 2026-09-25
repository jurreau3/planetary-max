import type { Bindings } from './contracts';
import type { JsonObject } from './contracts';

/**
 * umbrellaMode
 *
 * Normalizes the enforcement mode from environment variables.
 * STRICT is the default and correct mode for Portal‑OS.
 */
export function umbrellaMode(value: string | undefined): 'strict' | 'lenient' | 'off' {
  if (!value) return 'strict';

  const v = value.toLowerCase();
  if (v === 'strict' || v === 'lenient' || v === 'off') return v;

  return 'strict';
}

/**
 * governanceEnvelope
 *
 * Returns the governance metadata for the OS.
 * In STRICT mode, this includes enforcement flags and coherence signals.
 */
export function governanceEnvelope(mode: 'strict' | 'lenient' | 'off'): JsonObject {
  switch (mode) {
    case 'strict':
      return {
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
      };

    case 'lenient':
      return {
        mode: 'lenient',
        enforcement: {
          identity: true,
          roles: true,
          permissions: false,
          lanes: true,
          kernelCoherence: false,
          planetaryConsistency: false,
        },
        signals: {
          integrity: 1,
          coherence: 1,
          governanceActive: true,
        },
      };

    case 'off':
      return {
        mode: 'off',
        enforcement: {
          identity: false,
          roles: false,
          permissions: false,
          lanes: false,
          kernelCoherence: false,
          planetaryConsistency: false,
        },
        signals: {
          integrity: 1,
          coherence: 1,
          governanceActive: false,
        },
      };
  }
}

/**
 * enforceGovernance
 *
 * STRICT governance enforcement logic.
 * This is not yet wired into the kernel, but the OS can call it
 * when you want Umbrella to actively validate identity, roles,
 * permissions, and lane coherence.
 */
export function enforceGovernance(
  mode: 'strict' | 'lenient' | 'off',
  context: {
    identityOk: boolean;
    rolesOk: boolean;
    permissionsOk: boolean;
    laneOk: boolean;
    planetaryOk: boolean;
  }
): { ok: boolean; error?: { code: string; message: string } } {
  if (mode === 'off') {
    return { ok: true };
  }

  if (mode === 'lenient') {
    if (!context.identityOk) {
      return {
        ok: false,
        error: {
          code: 'IDENTITY_REQUIRED',
          message: 'Identity must be valid in lenient mode',
        },
      };
    }
    if (!context.rolesOk) {
      return {
        ok: false,
        error: {
          code: 'ROLE_REQUIRED',
          message: 'Role routing must be valid in lenient mode',
        },
      };
    }
    return { ok: true };
  }

  // STRICT MODE — full enforcement
  if (!context.identityOk) {
    return {
      ok: false,
      error: {
        code: 'IDENTITY_INVALID',
        message: 'Identity validation failed under strict governance',
      },
    };
  }

  if (!context.rolesOk) {
    return {
      ok: false,
      error: {
        code: 'ROLE_FORBIDDEN',
        message: 'Role does not allow access to this lane',
      },
    };
  }

  if (!context.permissionsOk) {
    return {
      ok: false,
      error: {
        code: 'PERMISSION_DENIED',
        message: 'Permission check failed under strict governance',
      },
    };
  }

  if (!context.laneOk) {
    return {
      ok: false,
      error: {
        code: 'LANE_INVALID',
        message: 'Lane routing failed under strict governance',
      },
    };
  }

  if (!context.planetaryOk) {
    return {
      ok: false,
      error: {
        code: 'PLANETARY_INCONSISTENT',
        message: 'Planetary mode is inconsistent with governance rules',
      },
    };
  }

  return { ok: true };
}
