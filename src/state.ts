import type { JsonObject } from './contracts';
import type { WindowManagerState } from './windows';
import type { PortalSurfaceState } from './portal';

/**
 * OsPhase
 *
 * High-level phase of Portal-OS.
 */
export type OsPhase =
  | 'boot'
  | 'console'
  | 'planetary'
  | 'institute';

/**
 * PortalOsState
 *
 * Aggregate OS state used by kernel, introspection, and dashboards.
 */
export type PortalOsState = {
  phase: OsPhase;
  version: string | null;
  planetaryMode: 'single' | 'planetary';
  windows: WindowManagerState;
  portal: PortalSurfaceState;
};

/**
 * createEmptyPortalOsState
 *
 * Base OS state when the system first boots.
 */
export function createEmptyPortalOsState(
  windows: WindowManagerState,
  portal: PortalSurfaceState,
  version?: string | null,
  planetaryMode?: 'single' | 'planetary',
): PortalOsState {
  return {
    phase: 'boot',
    version: version ?? null,
    planetaryMode: planetaryMode ?? 'single',
    windows,
    portal,
  };
}

/**
 * toPortalOsEnvelope
 *
 * Converts internal PortalOsState into a public JSON envelope
 * suitable for /introspection/os and dashboards.
 */
export function toPortalOsEnvelope(state: PortalOsState): JsonObject {
  return {
    ok: true,
    service: 'PORTAL-OS',
    version: state.version,
    phase: state.phase,
    planetaryMode: state.planetaryMode,
    windows: state.windows,
    portal: state.portal,
  };
}
