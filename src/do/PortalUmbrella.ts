// src/do/PortalUmbrella.ts
// Portal‑OS v11 — Umbrella Governance Field (constitutional layer)

import type { DurableObjectState } from "@cloudflare/workers-types";
import type { JsonObject } from "../contracts";

export interface UmbrellaRule {
  id: string;
  code: string;
  description: string;
  enabled: boolean;
}

export interface UmbrellaState {
  rules: UmbrellaRule[];
  lastUpdate: number | null;
}

export function createEmptyUmbrellaState(): UmbrellaState {
  return {
    rules: [
      {
        id: crypto.randomUUID(),
        code: "IDENTITY_MUST_EXIST",
        description: "Every action must be associated with a valid identity.",
        enabled: true,
      },
      {
        id: crypto.randomUUID(),
        code: "PANEL_ID_REQUIRED",
        description: "Panel actions must include a panel ID.",
        enabled: true,
      },
      {
        id: crypto.randomUUID(),
        code: "QUANTUM_ENTROPY_LIMIT",
        description: "Quantum entropy must remain below 0.95.",
        enabled: true,
      },
    ],
    lastUpdate: null,
  };
}

// ------------------------------------------------------------
// Load + Save
// ------------------------------------------------------------
export async function loadUmbrella(
  state: DurableObjectState
): Promise<UmbrellaState> {
  return (
    (await state.storage.get("portal:umbrella")) ??
    createEmptyUmbrellaState()
  );
}

export async function saveUmbrella(
  state: DurableObjectState,
  umbrella: UmbrellaState
) {
  await state.storage.put("portal:umbrella", umbrella);
}

// ------------------------------------------------------------
// Enforcement
// ------------------------------------------------------------
export function enforceUmbrella(
  umbrella: UmbrellaState,
  identity: string | null,
  payload: JsonObject
): UmbrellaRule[] {
  const violations: UmbrellaRule[] = [];

  for (const rule of umbrella.rules) {
    if (!rule.enabled) continue;

    switch (rule.code) {
      case "IDENTITY_MUST_EXIST":
        if (!identity) violations.push(rule);
        break;

      case "PANEL_ID_REQUIRED":
        if (
          payload.action &&
          ["open", "close", "move", "resize", "toggle"].includes(
            payload.action
          ) &&
          !payload.panel
        ) {
          violations.push(rule);
        }
        break;

      case "QUANTUM_ENTROPY_LIMIT":
        if (payload.entropy && payload.entropy > 0.95) {
          violations.push(rule);
        }
        break;
    }
  }

  return violations;
}

// ------------------------------------------------------------
// Envelope
// ------------------------------------------------------------
export function toUmbrellaEnvelope(
  umbrella: UmbrellaState,
  violations: UmbrellaRule[]
) {
  return {
    ok: true,
    umbrella: {
      rules: umbrella.rules,
      lastUpdate: umbrella.lastUpdate,
      violations,
    },
  };
}
