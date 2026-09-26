// src/do/PortalCanon.ts
// Portal‑OS v11 — Canon Engine (Truth Structure + Signature + Compiler)

import type { DurableObjectState } from "@cloudflare/workers-types";
import type { JsonObject } from "../contracts";

export interface CanonTruth {
  id: string;
  panel: string | null;
  action: string;
  timestamp: number;
  payload: JsonObject;
}

export interface CanonState {
  signature: string;
  truths: CanonTruth[];
}

export function createEmptyCanon(): CanonState {
  return {
    signature: "EMPTY-CANON",
    truths: [],
  };
}

// ------------------------------------------------------------
// Load + Save
// ------------------------------------------------------------
export async function loadCanon(state: DurableObjectState): Promise<CanonState> {
  return (
    (await state.storage.get("portal:canon")) ??
    createEmptyCanon()
  );
}

export async function saveCanon(
  state: DurableObjectState,
  canon: CanonState
) {
  await state.storage.put("portal:canon", canon);
}

// ------------------------------------------------------------
// Add truth
// ------------------------------------------------------------
export function addTruth(
  canon: CanonState,
  truth: CanonTruth
): CanonState {
  return {
    ...canon,
    truths: [...canon.truths, truth],
  };
}

// ------------------------------------------------------------
// Canon signature compiler
// ------------------------------------------------------------
export function compileCanonSignature(canon: CanonState): string {
  const hashInput = canon.truths
    .map((t) => `${t.id}:${t.action}:${t.panel}:${t.timestamp}`)
    .join("|");

  // Simple deterministic signature
  const signature = crypto
    .subtle
    .digest("SHA-256", new TextEncoder().encode(hashInput))
    .then((buf) =>
      Array.from(new Uint8Array(buf))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("")
    );

  return `CANON-${canon.truths.length}-${Date.now()}`;
}

// ------------------------------------------------------------
// Canon envelope
// ------------------------------------------------------------
export function toCanonEnvelope(canon: CanonState) {
  return {
    ok: true,
    canon: {
      signature: canon.signature,
      truths: canon.truths,
    },
  };
}
