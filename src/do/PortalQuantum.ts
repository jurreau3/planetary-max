// src/do/PortalQuantum.ts
// Portal‑OS v11 — Quantum Substrate (entropy + signatures + coherence)

import type { DurableObjectState } from "@cloudflare/workers-types";
import type { JsonObject } from "../contracts";

export interface QuantumField {
  id: string;
  timestamp: number;
  entropy: number;
  lane: string;
  panel: string | null;
  payload: JsonObject;
}

export interface QuantumState {
  signature: string;
  fields: QuantumField[];
  coherence: number;
}

export function createEmptyQuantum(): QuantumState {
  return {
    signature: "QUANTUM-EMPTY",
    fields: [],
    coherence: 1.0,
  };
}

// ------------------------------------------------------------
// Load + Save
// ------------------------------------------------------------
export async function loadQuantum(
  state: DurableObjectState
): Promise<QuantumState> {
  return (
    (await state.storage.get("portal:quantum")) ??
    createEmptyQuantum()
  );
}

export async function saveQuantum(
  state: DurableObjectState,
  quantum: QuantumState
) {
  await state.storage.put("portal:quantum", quantum);
}

// ------------------------------------------------------------
// Entropy generator
// ------------------------------------------------------------
export function computeEntropy(payload: JsonObject): number {
  const s = JSON.stringify(payload ?? {});
  let sum = 0;
  for (let i = 0; i < s.length; i++) {
    sum += s.charCodeAt(i);
  }
  return (sum % 1000) / 1000; // 0.0–0.999
}

// ------------------------------------------------------------
// Coherence calculator
// ------------------------------------------------------------
export function computeCoherence(fields: QuantumField[]): number {
  if (fields.length === 0) return 1.0;
  const avgEntropy =
    fields.reduce((acc, f) => acc + f.entropy, 0) / fields.length;
  return 1.0 - avgEntropy; // higher entropy → lower coherence
}

// ------------------------------------------------------------
// Signature compiler
// ------------------------------------------------------------
export function compileQuantumSignature(quantum: QuantumState): string {
  const base = quantum.fields
    .map((f) => `${f.id}:${f.entropy}:${f.lane}:${f.panel}`)
    .join("|");
  return `QSIG-${quantum.fields.length}-${base.length}`;
}

// ------------------------------------------------------------
// Add field
// ------------------------------------------------------------
export function addQuantumField(
  quantum: QuantumState,
  field: QuantumField
): QuantumState {
  const fields = [...quantum.fields, field];
  const coherence = computeCoherence(fields);
  const signature = compileQuantumSignature({ ...quantum, fields, coherence });

  return {
    ...quantum,
    fields,
    coherence,
    signature,
  };
}

// ------------------------------------------------------------
// Envelope
// ------------------------------------------------------------
export function toQuantumEnvelope(quantum: QuantumState) {
  return {
    ok: true,
    quantum: {
      signature: quantum.signature,
      coherence: quantum.coherence,
      fields: quantum.fields,
    },
  };
}
