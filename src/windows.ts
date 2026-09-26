//
// Portal‑OS Window Manager Substrate
// Window state + manager + envelopes
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
};

/**
 * WindowManagerState
 *
 * Represents the full window manager state.
 */
export type WindowManagerState = {
  windows: Record<string, WindowState>;
  order: string[]; // z‑order stack
};

/**
 * createEmptyWindowManagerState
 *
 * Base window manager state when Portal‑OS boots.
 */
export function createEmptyWindowManagerState(): WindowManagerState {
  return {
    windows: {},
    order: [],
  };
}

/**
 * createWindow
 *
 * Creates a new window.
 */
export function createWindow(
  id: string,
  title: string,
  x: number,
  y: number,
  width: number,
  height: number,
): WindowState {
  return {
    id,
    title,
    x,
    y,
    width,
    height,
    focused: false,
  };
}

/**
 * addWindow
 *
 * Adds a window to the manager.
 */
export function addWindow(
  manager: WindowManagerState,
  window: WindowState,
): WindowManagerState {
  return {
    windows: {
      ...manager.windows,
      [window.id]: window,
    },
    order: [...manager.order, window.id],
  };
}

/**
 * focusWindow
 *
 * Focuses a window by ID.
 */
export function focusWindow(
  manager: WindowManagerState,
  id: string,
): WindowManagerState {
  if (!manager.windows[id]) return manager;

  const updated = {
    ...manager.windows[id],
    focused: true,
  };

  return {
    windows: {
      ...manager.windows,
      [id]: updated,
    },
    order: [...manager.order.filter((w) => w !== id), id],
  };
}

/**
 * moveWindow
 *
 * Moves a window to a new position.
 */
export function moveWindow(
  manager: WindowManagerState,
  id: string,
  x: number,
  y: number,
): WindowManagerState {
  const win = manager.windows[id];
  if (!win) return manager;

  return {
    windows: {
      ...manager.windows,
      [id]: {
        ...win,
        x,
        y,
      },
    },
    order: manager.order,
  };
}

/**
 * resizeWindow
 *
 * Resizes a window.
 */
export function resizeWindow(
  manager: WindowManagerState,
  id: string,
  width: number,
  height: number,
): WindowManagerState {
  const win = manager.windows[id];
  if (!win) return manager;

  return {
    windows: {
      ...manager.windows,
      [id]: {
        ...win,
        width,
        height,
      },
    },
    order: manager.order,
  };
}

/**
 * toWindowsEnvelope
 *
 * Converts window manager state into a public JSON envelope.
 */
export function toWindowsEnvelope(manager: WindowManagerState): JsonObject {
  return {
    ok: true,
    service: "PORTAL-WINDOWS",
    windows: manager.windows,
    order: manager.order,
  };
}
