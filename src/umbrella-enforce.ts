//
// Umbrella Governance Enforcement Substrate
//

import type { Bindings, JsonObject } from "./contracts";
import { kernelError } from "./errors";
import { verifyJwt } from "./jwt";

export type UmbrellaCheck = {
  ok: boolean;
  error?: JsonObject;
};

export function enforceUmbrella(
  mode: string | undefined,
  context: {
    identityOk: boolean;
    rolesOk: boolean;
    permissionsOk: boolean;
    laneOk: boolean;
    planetaryOk: boolean;
  }
): UmbrellaCheck {
  const m = mode ?? "strict";

  if (m === "off") {
    return { ok: true };
  }

  if (!context.identityOk) {
    return {
      ok: false,
      error: kernelError("UMBRELLA_IDENTITY_FAILED", {
        message: "Identity check failed under umbrella enforcement",
      }),
    };
  }

  if (!context.rolesOk) {
    return {
      ok: false,
      error: kernelError("UMBRELLA_ROLES_FAILED", {
        message: "Role check failed under umbrella enforcement",
      }),
    };
  }

  if (!context.permissionsOk) {
    return {
      ok: false,
      error: kernelError("UMBRELLA_PERMISSIONS_FAILED", {
        message: "Permission check failed under umbrella enforcement",
      }),
    };
  }

  if (!context.laneOk) {
    return {
      ok: false,
      error: kernelError("UMBRELLA_LANE_FAILED", {
        message: "Lane check failed under umbrella enforcement",
      }),
    };
  }

  if (!context.planetaryOk) {
    return {
      ok: false,
      error: kernelError("UMBRELLA_PLANETARY_FAILED", {
        message: "Planetary check failed under umbrella enforcement",
      }),
    };
  }

  return { ok: true };
}

/**
 * toUmbrellaErrorEnvelope
 *
 * Normalizes umbrella errors into a public envelope.
 */
export function toUmbrellaErrorEnvelope(error: JsonObject | null) {
  if (!error) {
    return {
      ok: true,
      service: "UMBRELLA",
      error: null,
    };
  }

  return {
    ok: false,
    service: "UMBRELLA",
    error,
  };
}

/**
 * verifyIdentityJwt
 *
 * Legacy wrapper used by older governance code.
 */
export async function verifyIdentityJwt(
  token: string | undefined,
  env: Bindings
) {
  if (!env.JWT_SECRET) {
    return {
      ok: false,
      error: kernelError("IDENTITY_CONFIG_MISSING", {
        message: "JWT_SECRET is not configured in environment",
      }),
    };
  }

  return verifyJwt(token, env.JWT_SECRET);
}
