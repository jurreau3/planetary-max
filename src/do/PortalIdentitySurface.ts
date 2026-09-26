// src/do/PortalIdentitySurface.ts
// Portal‑OS v11 — Identity Surfaces (multi‑user presence + roles)

import type { DurableObjectState } from "@cloudflare/workers-types";
import type { JsonObject } from "../contracts";

export type IdentityRole = "admin" | "user" | "observer";

export interface IdentityPresence {
  lastSeen: number;
  activePanels: string[];
  advisoryWeight: number;
  quantumWeight: number;
  timelineWeight: number;
}

export interface IdentitySurface {
  id: string;
  name: string;
  role: IdentityRole;
  permissions: string[];
  presence: IdentityPresence;
}

export interface IdentitySurfaceState {
  identities: IdentitySurface[];
}

export function createEmptyIdentitySurfaceState(): IdentitySurfaceState {
  return {
    identities: [],
  };
}

// ------------------------------------------------------------
// Load + Save
// ------------------------------------------------------------
export async function loadIdentitySurface(
  state: DurableObjectState
): Promise<IdentitySurfaceState> {
  return (
    (await state.storage.get("portal:identity-surface")) ??
    createEmptyIdentitySurfaceState()
  );
}

export async function saveIdentitySurface(
  state: DurableObjectState,
  identitySurface: IdentitySurfaceState
) {
  await state.storage.put("portal:identity-surface", identitySurface);
}

// ------------------------------------------------------------
// Identity Upsert
// ------------------------------------------------------------
export function upsertIdentity(
  state: IdentitySurfaceState,
  identityId: string,
  name: string,
  role: IdentityRole = "user"
): IdentitySurfaceState {
  const existing = state.identities.find((i) => i.id === identityId);
  const now = Date.now();

  if (existing) {
    const updated: IdentitySurface = {
      ...existing,
      name,
      role,
      presence: {
        ...existing.presence,
        lastSeen: now,
      },
    };

    return {
      ...state,
      identities: state.identities.map((i) =>
        i.id === identityId ? updated : i
      ),
    };
  }

  const created: IdentitySurface = {
    id: identityId,
    name,
    role,
    permissions: role === "admin" ? ["*"] : ["portal:view", "portal:move"],
    presence: {
      lastSeen: now,
      activePanels: [],
      advisoryWeight: role === "admin" ? 1.0 : 0.7,
      quantumWeight: 1.0,
      timelineWeight: 1.0,
    },
  };

  return {
    ...state,
    identities: [...state.identities, created],
  };
}

// ------------------------------------------------------------
// Presence Update
// ------------------------------------------------------------
export function updateIdentityPresence(
  state: IdentitySurfaceState,
  identityId: string,
  panelId: string | null
): IdentitySurfaceState {
  const now = Date.now();

  return {
    ...state,
    identities: state.identities.map((i) => {
      if (i.id !== identityId) return i;

      const activePanels = [...i.presence.activePanels];
      if (panelId && !activePanels.includes(panelId)) {
        activePanels.push(panelId);
      }

      return {
        ...i,
        presence: {
          ...i.presence,
          lastSeen: now,
          activePanels,
        },
      };
    }),
  };
}

// ------------------------------------------------------------
// Envelope
// ------------------------------------------------------------
export function toIdentitySurfaceEnvelope(identitySurface: IdentitySurfaceState) {
  return {
    ok: true,
    identitySurface: {
      identities: identitySurface.identities,
    },
  };
}
