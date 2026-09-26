// src/do/PortalAdvisory.ts
// Portal‑OS v11 — Advisory Engine (governance + coherence warnings)

import type { DurableObjectState } from "@cloudflare/workers-types";
import type { JsonObject } from "../contracts";
import type { QuantumState } from "./PortalQuantum";
import type { PortalTimeline } from "./PortalTimeline";

export interface AdvisoryIssue {
  id: string;
  timestamp: number;
  severity: "info" | "warn" | "error";
  code: string;
  message: string;
  context: JsonObject;
}

export interface AdvisoryState {
  issues: AdvisoryIssue[];
  lastCheck: number | null;
}

export function createEmptyAdvisory(): AdvisoryState {
  return {
    issues: [],
    lastCheck: null,
  };
}

// ------------------------------------------------------------
// Load + Save
// ------------------------------------------------------------
export async function loadAdvisory(
  state: DurableObjectState
): Promise<AdvisoryState> {
  return (
    (await state.storage.get("portal:advisory")) ??
    createEmptyAdvisory()
  );
}

export async function saveAdvisory(
  state: DurableObjectState,
  advisory: AdvisoryState
) {
  await state.storage.put("portal:advisory", advisory);
}

// ------------------------------------------------------------
// Advisory evaluation
// ------------------------------------------------------------
export function evaluateAdvisory(
  quantum: QuantumState,
  timeline: PortalTimeline
): AdvisoryIssue[] {
  const issues: AdvisoryIssue[] = [];
  const now = Date.now();

  // Quantum coherence warning
  if (quantum.coherence < 0.5) {
    issues.push({
      id: crypto.randomUUID(),
      timestamp: now,
      severity: "warn",
      code: "QUANTUM_LOW_COHERENCE",
      message: "Quantum substrate coherence is below 0.5",
      context: {
        coherence: quantum.coherence,
        fields: quantum.fields.length,
      },
    });
  }

  // High entropy field count
  const highEntropyFields = quantum.fields.filter((f) => f.entropy > 0.8);
  if (highEntropyFields.length > 0) {
    issues.push({
      id: crypto.randomUUID(),
      timestamp: now,
      severity: "info",
      code: "QUANTUM_HIGH_ENTROPY_FIELDS",
      message: "One or more quantum fields have high entropy",
      context: {
        count: highEntropyFields.length,
      },
    });
  }

  // Timeline length advisory
  if (timeline.events.length > 500) {
    issues.push({
      id: crypto.randomUUID(),
      timestamp: now,
      severity: "info",
      code: "TIMELINE_LONG",
      message: "Portal timeline has more than 500 events",
      context: {
        events: timeline.events.length,
      },
    });
  }

  return issues;
}

// ------------------------------------------------------------
// Envelope
// ------------------------------------------------------------
export function toAdvisoryEnvelope(advisory: AdvisoryState) {
  return {
    ok: true,
    advisory: {
      issues: advisory.issues,
      lastCheck: advisory.lastCheck,
    },
  };
}
