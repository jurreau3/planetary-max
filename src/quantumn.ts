import {
  QuantumBranch,
  QuantumOverlay,
  QuantumCollapsePolicy,
} from "./types";

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

export function normalizeProbabilities(
  branches: QuantumBranch[]
): QuantumBranch[] {
  const total = branches.reduce((sum, b) => sum + b.probability, 0) || 1;
  return branches.map((b) => ({
    ...b,
    probability: b.probability / total,
  }));
}

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

export function collapseQuantumBranches(
  overlay: QuantumOverlay,
  policy: QuantumCollapsePolicy
): Record<string, unknown> {
  return overlay.branches[0].stateDelta;
}
