import {
  QuantumBranch,
  QuantumOverlay,
  QuantumCollapsePolicy,
  GovernanceMetadata,
  QuantumGovernanceContext,
} from "./types";

/**
 * Generate deterministic quantum branches.
 * In the unified quantum layer, branches are deterministic overlays
 * with SHA-256 signatures and stateDelta propagation.
 */
export function generateQuantumBranches(
  baseState: Record<string, unknown>
): QuantumBranch[] {
  return [
    {
      id: "canonical",
      probability: 1,
      stateDelta: {},
      signature: "sha256:canonical",
    },
  ];
}

/**
 * Normalize branch probabilities so they sum to 1.
 */
export function normalizeProbabilities(
  branches: QuantumBranch[]
): QuantumBranch[] {
  const total = branches.reduce((sum, b) => sum + b.probability, 0) || 1;
  return branches.map((b) => ({
    ...b,
    probability: b.probability / total,
  }));
}

/**
 * Derive curvature from identity or governance metadata.
 * This is a simplified placeholder for the real curvature engine.
 */
export function deriveIdentityCurvature(
  metadata: GovernanceMetadata[] | undefined
): number {
  if (!metadata || metadata.length === 0) return 1;
  return 1 + metadata.length * 0.01;
}

/**
 * Generate a unified quantum overlay.
 * This is the canonical overlay/collapse pipeline.
 */
export function generateQuantumOverlay(
  baseState: Record<string, unknown>,
  policy: QuantumCollapsePolicy
): QuantumOverlay {
  const branches = normalizeProbabilities(generateQuantumBranches(baseState));

  return {
    branches,
    curvature: 1,
    signature: "sha256:overlay",
    collapsePolicy: policy,
  };
}

/**
 * Collapse quantum branches into a deterministic stateDelta.
 */
export function collapseQuantumBranches(
  overlay: QuantumOverlay,
  policy: QuantumCollapsePolicy
): Record<string, unknown> {
  return overlay.branches[0].stateDelta;
}

/**
 * Governance → Quantum collapse policy mapping.
 */
export function quantumGovernanceFromContext(
  context: QuantumGovernanceContext
): QuantumCollapsePolicy {
  if (context.metadata && context.metadata.length > 0) {
    return "governed";
  }
  return "deterministic";
}
