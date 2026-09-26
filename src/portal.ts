//
// Portal‑OS Portal Surface Substrate
// Unified portal state + envelopes
//

import type { JsonObject } from "./contracts";

/**
 * PortalSurfaceState
 *
 * Represents the main Portal‑OS surface:
 * active view, mode, and any attached metadata.
 */
export type PortalSurfaceState = {
  view: string | null;
  mode: "console" | "planetary" | "institute" | "sim" | null;
  metadata: JsonObject;
};

/**
 * createEmptyPortalSurfaceState
 *
 * Base portal surface state when OS boots.
 */
export function createEmptyPortalSurfaceState(): PortalSurfaceState {
  return {
    view: null,
    mode: "console",
    metadata: {},
  };
}

/**
 * toPortalEnvelope
 *
 * Converts internal portal surface state into a public JSON envelope.
 */
export function toPortalEnvelope(state: PortalSurfaceState): JsonObject {
  return {
    ok: true,
    service: "PORTAL-SURFACE",
    view: state.view,
    mode: state.mode,
    metadata: state.metadata,
  };
}
