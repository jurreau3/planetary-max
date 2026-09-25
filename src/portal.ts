import type { JsonObject } from './contracts';
import type { WindowId } from './windows';

/**
 * PortalSurfaceState
 *
 * High‑level state for the Portal surface — the OS canvas that
 * coordinates windows, modes, and surface activation.
 */
export type PortalSurfaceState = {
  active: boolean;
  mode: 'console' | 'planetary' | 'institute';
  focusedWindow: WindowId | null;
  windows: WindowId[];
  timeline: PortalTimelineEvent[];
};

/**
 * PortalTimelineEvent
 *
 * Historical events for Portal surface introspection.
 */
export type PortalTimelineEvent = {
  id: string;
  type:
    | 'activate'
    | 'deactivate'
    | 'focus-window'
    | 'open-window'
    | 'close-window'
    | 'mode-change';
  at: number;
  payload?: JsonObject;
};

/**
 * createEmptyPortalSurfaceState
 *
 * Base state for the Portal surface when no windows or modes
 * have been activated yet.
 */
export function createEmptyPortalSurfaceState(): PortalSurfaceState {
  return {
    active: true,
    mode: 'console',
    focusedWindow: null,
    windows: [],
    timeline: [],
  };
}

/**
 * toPortalEnvelope
 *
 * Converts internal PortalSurfaceState into a public JSON envelope
 * compatible with /portal routes and kernel responses.
 */
export function toPortalEnvelope(state: PortalSurfaceState): JsonObject {
  return {
    ok: true,
    service: 'PORTAL',
    version: 1,
    surface: {
      active: state.active,
      mode: state.mode,
      focusedWindow: state.focusedWindow,
      windows: state.windows,
      timeline: state.timeline,
    },
  };
}
