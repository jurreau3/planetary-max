//
// Portal‑OS Unified State Substrate
// OS-level envelope + versioning + planetary mode
//

import type { JsonObject } from "./contracts";
import type { WindowManagerState } from "./windows";
import type { PortalSurfaceState } from "./portal";

/**
 * PortalOsState
 *
 * Unified OS state returned by the kernel.
 */
export type PortalOsState = {
  version: string;
  planetaryMode: "single" | "planetary";
  windows: WindowManagerState;
  portal: PortalSurfaceState;
  metadata: JsonObject;
};

/**
 * createEmptyPortalOsState
 *
 * Base OS state when Portal‑OS boots.
 */
export function createEmptyPortalOsState(
  windows: WindowManagerState,
  portal: PortalSurfaceState,
  version: string | undefined,
  planetaryMode: "single" | "planetary" | undefined,
): PortalOsState {
  return {
    version: version ?? "0.0.0",
    planetaryMode: planetaryMode ?? "single",
    windows,
    portal,
    metadata: {},
  };
}

/**
 * toOsEnvelope
 *
 * Converts internal OS state into a public JSON envelope.
 */
export function toOsEnvelope(state: PortalOsState): JsonObject {
  return {
    ok: true,
    service: "PORTAL-OS",
    version: state.version,
    planetaryMode: state.planetaryMode,
    windows: state.windows,
    portal: state.portal,
    metadata: state.metadata,
  };
}
