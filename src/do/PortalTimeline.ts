//
// Portal‑OS Portal Timeline Engine
// Records every panel action as an event
//

import type { JsonObject } from "../contracts";

export type PortalTimelineEvent = {
  id: string;
  timestamp: number;
  action: string;
  panel: string | null;
  payload: JsonObject;
};

export type PortalTimeline = {
  events: PortalTimelineEvent[];
};

export function createEmptyPortalTimeline(): PortalTimeline {
  return {
    events: [],
  };
}

export function addTimelineEvent(
  timeline: PortalTimeline,
  event: PortalTimelineEvent
): PortalTimeline {
  return {
    events: [...timeline.events, event],
  };
}

export function toPortalTimelineEnvelope(timeline: PortalTimeline): JsonObject {
  return {
    ok: true,
    service: "PORTAL-TIMELINE",
    events: timeline.events,
  };
}
