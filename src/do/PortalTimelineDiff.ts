//
// Portal‑OS Portal Timeline Diff Engine
// Computes diffs between any two timeline snapshots
//

import type { JsonObject } from "../contracts";
import type { PortalTimelineEvent, PortalTimeline } from "./PortalTimeline";
import type { PortalSurfaceState } from "./PortalSurface";

export type PortalDiff = {
  from: string;
  to: string;
  timestampFrom: number;
  timestampTo: number;
  changes: JsonObject[];
};

export function computePortalDiff(
  surfaceBefore: PortalSurfaceState,
  surfaceAfter: PortalSurfaceState,
  eventFrom: PortalTimelineEvent,
  eventTo: PortalTimelineEvent
): PortalDiff {
  const changes: JsonObject[] = [];

  const beforePanels = surfaceBefore.panels;
  const afterPanels = surfaceAfter.panels;

  const allIds = new Set([
    ...Object.keys(beforePanels),
    ...Object.keys(afterPanels),
  ]);

  for (const id of allIds) {
    const before = beforePanels[id];
    const after = afterPanels[id];

    if (!before && after) {
      changes.push({
        type: "panel-created",
        id,
        after,
      });
      continue;
    }

    if (before && !after) {
      changes.push({
        type: "panel-removed",
        id,
        before,
      });
      continue;
    }

    if (before && after) {
      const delta: JsonObject = {};
      let changed = false;

      for (const key of ["x", "y", "width", "height", "visible", "title"]) {
        if (before[key] !== after[key]) {
          delta[key] = { before: before[key], after: after[key] };
          changed = true;
        }
      }

      if (changed) {
        changes.push({
          type: "panel-updated",
          id,
          delta,
        });
      }
    }
  }

  return {
    from: eventFrom.id,
    to: eventTo.id,
    timestampFrom: eventFrom.timestamp,
    timestampTo: eventTo.timestamp,
    changes,
  };
}

export function toPortalDiffEnvelope(diff: PortalDiff): JsonObject {
  return {
    ok: true,
    service: "PORTAL-DIFF",
    diff,
  };
}
