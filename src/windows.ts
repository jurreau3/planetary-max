import type { JsonObject } from './contracts';

/**
 * WindowId
 *
 * Unique identifier for a window instance.
 */
export type WindowId = string;

/**
 * WindowKind
 *
 * The type of window being displayed.
 */
export type WindowKind =
  | 'portal'
  | 'sim'
  | 'console'
  | 'panel'
  | 'overlay';

/**
 * WindowState
 *
 * Full state for a single window instance.
 */
export type WindowState = {
  id: WindowId;
  kind: WindowKind;
  title: string;
  focused: boolean;
  visible: boolean;
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * WindowLayoutMode
 *
 * How windows are arranged.
 */
export type WindowLayoutMode =
  | 'floating'
  | 'tiled'
  | 'stacked';

/**
 * WindowLayout
 *
 * Layout container for all windows.
 */
export type WindowLayout = {
  mode: WindowLayoutMode;
  windows: WindowState[];
};

/**
 * WindowTimelineEvent
 *
 * Historical events for window manager introspection.
 */
export type WindowTimelineEvent = {
  id: string;
  type: 'open' | 'close' | 'focus' | 'blur' | 'move' | 'resize';
  windowId: WindowId;
  at: number;
  payload?: JsonObject;
};

/**
 * WindowManagerState
 *
 * Full state for the window manager.
 */
export type WindowManagerState = {
  active: boolean;
  focused: WindowId | null;
  layout: WindowLayout;
  timeline: WindowTimelineEvent[];
};

/**
 * createEmptyWindowManagerState
 *
 * Base state used when the kernel has no windows yet.
 */
export function createEmptyWindowManagerState(): WindowManagerState {
  return {
    active: true,
    focused: null,
    layout: {
      mode: 'floating',
      windows: [],
    },
    timeline: [],
  };
}

/**
 * toWindowsEnvelope
 *
 * Converts internal WindowManagerState into a public JSON envelope.
 * Used by /windows and all introspection routes.
 */
export function toWindowsEnvelope(state: WindowManagerState): JsonObject {
  return {
    ok: true,
    service: 'WINDOWS',
    version: 1,
    manager: {
      active: state.active,
      focused: state.focused,
      layout: state.layout,
      timeline: state.timeline,
    },
  };
}
