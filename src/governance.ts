import {
  GovernanceMetadata,
  GovernanceInference,
  GovernanceDecision,
  KernelEnvelope,
  QuantumCollapsePolicy,
  QuantumGovernanceContext,
} from "./types";

/**
 * Resolve umbrella enforcement mode from environment.
 */
export function resolveUmbrellaMode(
  enforcement: string | undefined
): string {
  if (!enforcement) return "disabled";
  if (enforcement === "strict") return "strict";
  if (enforcement === "advisory") return "advisory";
  return "unknown";
}

/**
 * Evaluate governance metadata for a kernel envelope.
 * This determines whether the message is allowed or denied.
 */
export function evaluateGovernance(
  envelope: KernelEnvelope,
  enforcement: string | undefined
): GovernanceMetadata {
  const mode = resolveUmbrellaMode(enforcement);

  // Basic governance rule: deny if payload contains forbidden keys
  const forbiddenKeys = ["forbidden", "restricted", "unsafe"];
  const payloadKeys = Object.keys(envelope.payload);

  const violation = payloadKeys.find((key) =>
    forbiddenKeys.includes(key)
  );

  if (violation) {
    return {
      id: "governance-denied",
      kind: "constraint",
      source: "portal",
      decision: "denied",
      createdAt: new Date().toISOString(),
      tags: [`violation:${violation}`, `mode:${mode}`],
    };
  }

  return {
    id: "governance-allowed",
    kind: "policy",
    source: "portal",
    decision: "allowed",
    createdAt: new Date().toISOString(),
    tags: [`mode:${mode}`],
  };
}

/**
 * Extract governance inference metadata from context.
 */
export function governanceInferenceFromContext(
  context: Record<string, unknown>
): GovernanceMetadata[] {
  const metadata = context.metadata;
  if (!metadata || !Array.isArray(metadata)) return [];
  return metadata as GovernanceMetadata[];
}

/**
 * Map governance context → quantum collapse policy.
 */
export function quantumGovernanceFromContext(
  context: QuantumGovernanceContext
): QuantumCollapsePolicy {
  if (context.metadata && context.metadata.length > 0) {
    return "governed";
  }
  return "deterministic";
}
