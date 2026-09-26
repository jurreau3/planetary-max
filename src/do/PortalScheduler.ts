// src/do/PortalScheduler.ts
// Portal‑OS v11 — Scheduler (tick engine + substrate updates)

import type { DurableObjectState } from "@cloudflare/workers-types";
import type { JsonObject } from "../contracts";
import type { QuantumState } from "./PortalQuantum";
import type { AdvisoryState } from "./PortalAdvisory";
import type { IdentitySurfaceState } from "./PortalIdentitySurface";

export interface SchedulerTick {
  id: string;
  timestamp: number;
  quantumSignature: string;
  advisoryCount: number;
  identityCount: number;
}

export interface SchedulerState {
  ticks: SchedulerTick[];
  lastTick: number | null;
}

export function createEmptySchedulerState(): SchedulerState {
  return {
    ticks: [],
    lastTick: null,
  };
}

// ------------------------------------------------------------
// Load + Save
// ------------------------------------------------------------
export async function loadScheduler(
  state: DurableObjectState
): Promise<SchedulerState> {
  return (
    (await state.storage.get("portal:scheduler")) ??
    createEmptySchedulerState()
  );
}

export async function saveScheduler(
  state: DurableObjectState,
  scheduler: SchedulerState
) {
  await state.storage.put("portal:scheduler", scheduler);
}

// ------------------------------------------------------------
// Tick generator
// ------------------------------------------------------------
export function generateTick(
  quantum: QuantumState,
  advisory: AdvisoryState,
  identitySurface: IdentitySurfaceState
): SchedulerTick {
  return {
    id: crypto.randomUUID(),
    timestamp: Date.now(),
    quantumSignature: quantum.signature,
    advisoryCount: advisory.issues.length,
    identityCount: identitySurface.identities.length,
  };
}

// ------------------------------------------------------------
// Envelope
// ------------------------------------------------------------
export function toSchedulerEnvelope(scheduler: SchedulerState) {
  return {
    ok: true,
    scheduler: {
      ticks: scheduler.ticks,
      lastTick: scheduler.lastTick,
    },
  };
}
