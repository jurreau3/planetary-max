//
// Portal‑OS Window Manager Substrate
// Unified window state + envelopes
//

import type { JsonObject } from "./contracts";

/**
 * WindowState
 *
 * Represents a single window in Portal‑OS.
 */
export type WindowState = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  focused: boolean;
  minimized: boolean;
  maximized: boolean;
};

/**
 * WindowManagerState
 *
 * Full window manager state for Portal‑OS.
 */
export type WindowManagerState = {
  windows: Record<string, WindowState>;
  focusOrder: string[];
};

/**
 * createEmptyWindowManagerState
 *
 * Base window manager state when OS boots.
 */
export function createEmptyWindowManagerState(): WindowManagerState {
  return {
    windows: {},
    focusOrder: [],
  };
}

/**
 * toWindowsEnvelope
 *
 * Converts internal window manager state into a public JSON envelope.
 */
export function toWindowsEnvelope(state: WindowManagerState): JsonObject {
  return {
    ok: true,
    service: "WINDOW-MANAGER",
    windows: state.windows,
    focusOrder: state.focusOrder,
  };
}
