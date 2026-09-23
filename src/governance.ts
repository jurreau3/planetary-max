import {
  GovernanceContext,
  GovernanceMetadata,
  QuantumCollapsePolicy,
} from "./types";

export function quantumGovernanceFromContext(
  context: GovernanceContext
): QuantumCollapsePolicy {
  return "governed";
}

export function governanceInferenceFromContext(
  context: GovernanceContext
): GovernanceMetadata[] {
  return context.metadata ?? [];
}
