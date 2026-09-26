//
// Portal‑OS Umbrella Governance Substrate
// Mode normalization + envelope generation
//

import type { JsonObject } from "./contracts";

/**
 * UmbrellaMode
 *
 * OFF       → no enforcement
 * LENIENT   → identity + roles
 * STRICT    → full governance enforcement
 */
export type UmbrellaMode = "off" | "lenient" | "strict";

/**
 * umbrellaMode
 *
 * Normalizes raw enforcement mode from environment.
 */
export function umbrellaMode(raw: string | undefined): UmbrellaMode {
  if (!raw) return "off";

  const normalized = raw.toLowerCase().trim();

  if (normalized === "strict") return "strict";
  if (normalized === "lenient") return "lenient";

  return "off";
}

/**
 * umbrellaSurfaceEnvelope
 *
 * Public governance envelope for /introspection/umbrella.
 */
export function umbrellaSurfaceEnvelope(raw: string | undefined): JsonObject {
  const mode = umbrellaMode(raw);

  return {
    ok: true,
    service: "UMBRELLA-GOVERNANCE",
    mode,
    enforcement: {
      identity: mode !== "off",
      roles: mode !== "off",
      permissions: mode === "strict",
      lane: mode === "strict",
      planetary: mode === "strict",
    },
  };
}

/**
 * umbrellaStatusEnvelope
 *
 * Lightweight governance status for /introspection/umbrella/status.
 */
export function umbrellaStatusEnvelope(raw: string | undefined): JsonObject {
  const mode = umbrellaMode(raw);

  return {
    ok: true,
    mode,
  };
}
