//
// Portal‑OS Surface State Engine
// Durable Object state for interactive portal panels
//

import type { JsonObject } from "../contracts";

export type PortalPanel = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  visible: boolean;
};

export type PortalSurfaceState = {
  panels: Record<string, PortalPanel>;
  order: string[];
};

export function createEmptyPortalSurfaceState(): PortalSurfaceState {
  return {
    panels: {},
    order: [],
  };
}

export function openPanel(
  surface: PortalSurfaceState,
  panel: PortalPanel
): PortalSurfaceState {
  return {
    panels: {
      ...surface.panels,
      [panel.id]: panel,
    },
    order: [...surface.order, panel.id],
  };
}

export function closePanel(
  surface: PortalSurfaceState,
  id: string
): PortalSurfaceState {
  const { [id]: _, ...rest } = surface.panels;

  return {
    panels: rest,
    order: surface.order.filter((p) => p !== id),
  };
}

export function movePanel(
  surface: PortalSurfaceState,
  id: string,
  x: number,
  y: number
): PortalSurfaceState {
  const panel = surface.panels[id];
  if (!panel) return surface;

  return {
    panels: {
      ...surface.panels,
      [id]: {
        ...panel,
        x,
        y,
      },
    },
    order: surface.order,
  };
}

export function resizePanel(
  surface: PortalSurfaceState,
  id: string,
  width: number,
  height: number
): PortalSurfaceState {
  const panel = surface.panels[id];
  if (!panel) return surface;

  return {
    panels: {
      ...surface.panels,
      [id]: {
        ...panel,
        width,
        height,
      },
    },
    order: surface.order,
  };
}

export function togglePanel(
  surface: PortalSurfaceState,
  id: string,
  visible: boolean
): PortalSurfaceState {
  const panel = surface.panels[id];
  if (!panel) return surface;

  return {
    panels: {
      ...surface.panels,
      [id]: {
        ...panel,
        visible,
      },
    },
    order: surface.order,
  };
}

export function toPortalEnvelope(surface: PortalSurfaceState): JsonObject {
  return {
    ok: true,
    service: "PORTAL-SURFACE",
    panels: surface.panels,
    order: surface.order,
  };
}
