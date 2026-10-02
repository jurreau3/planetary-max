import type { QuantumBranch, QuantumCollapsePolicy } from "./types";

export function collapseQuantumBranches(
  branches: QuantumBranch[],
  _seed?: string,
  _context?: unknown,
): QuantumBranch {
  return branches[0] ?? {
    id: "default",
    probability: 1,
    stateDelta: {},
    signature: "default",
  };
}

export function generateQuantumOverlay() {
  return {
    branches: [],
    curvature: 0,
    signature: "",
    collapsePolicy: "deterministic" as QuantumCollapsePolicy,
  };
}
