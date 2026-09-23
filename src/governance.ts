//
// Unified Governance Layer
// MAX‑Institute + Portal‑OS Wing
//

import {
  GovernanceMetadata,
  UmbrellaMode,
  QuantumGovernanceContext,
  KernelEnvelope,
} from "./types";

export function governanceFromMode(mode: UmbrellaMode): GovernanceMetadata {
  return {
    mode,
    decision: mode === "strict" ? "deny" : "allow",
  };
}

export function quantumGovernanceFromContext(
  ctx: QuantumGovernanceContext
): GovernanceMetadata {
  return {
    mode: ctx.mode,
    decision: ctx.mode === "strict" ? "deny" : "allow",
    reason: ctx.identity ? `identity:${ctx.identity}` : undefined,
  };
}

export function validateEnvelopeGovernance(
  envelope: KernelEnvelope,
  governance: GovernanceMetadata
): boolean {
  if (governance.mode === "off") return true;
  if (governance.mode === "advisory") return true;
  if (governance.mode === "strict") {
    return envelope.lane !== "umbrella";
  }
  return true;
}
