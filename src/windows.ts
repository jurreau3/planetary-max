import type { JsonObject } from './contracts';

export type WindowId = string;

export type WindowKind =
  | 'portal'
  | 'sim'
  | 'console'
  | 'panel'
  | 'overlay';

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

export type WindowLayoutMode =
  | 'floating'
  | 'tiled'
  | 'stacked';

export type WindowLayout = {
  mode: WindowLayoutMode;
  windows: WindowState[];
};

export type WindowTimelineEvent = {
  id: string;
  type: 'open' | 'close' | 'focus' | 'blur' | 'move' | 'resize';
  windowId: WindowId;
  at: number;
  payload?: JsonObject;
};

export type WindowManagerState = {
  active: boolean;
  focused: WindowId | null;
  layout: WindowLayout;
  timeline: WindowTimelineEvent[];
};

/**
 * createEmptyWindowManagerState
 *
 * Base state for the window manager. Used by kernel and introspection
 * when no windows have been opened yet.
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
 * Converts a WindowManagerState into a public JSON envelope
 * compatible with /windows and introspection routes.
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
