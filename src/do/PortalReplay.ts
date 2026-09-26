// src/do/PortalReplay.ts
// Portal‑OS v11 — Replay Engine Substrate

import {
  createEmptyPortalSurfaceState,
  openPanel,
  closePanel,
  movePanel,
  resizePanel,
  togglePanel,
  type PortalSurfaceState,
} from "./PortalSurface";

import type { PortalTimeline, PortalTimelineEvent } from "./PortalTimeline";

export function replaySurface(
  timeline: PortalTimeline,
  untilEventId: string | null
): PortalSurfaceState {
  let surface = createEmptyPortalSurfaceState();

  for (const event of timeline.events) {
    applyEvent(surface, event);

    if (event.id === untilEventId) break;
  }

  return surface;
}

function applyEvent(
  surface: PortalSurfaceState,
  event: PortalTimelineEvent
): void {
  const { action, panel, payload } = event;

  switch (action) {
    case "open":
      openPanel(surface, {
        id: panel!,
        title: payload.title ?? panel,
        x: payload.x ?? 100,
        y: payload.y ?? 100,
        width: payload.width ?? 300,
        height: payload.height ?? 200,
        visible: true,
      });
      break;

    case "close":
      closePanel(surface, panel!);
      break;

    case "move":
      movePanel(surface, panel!, payload.x, payload.y);
      break;

    case "resize":
      resizePanel(surface, panel!, payload.width, payload.height);
      break;

    case "toggle":
      togglePanel(surface, panel!, payload.visible);
      break;
  }
}
