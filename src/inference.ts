import { QuantumOverlay } from "./types";

export type InferenceArtifacts = {
  overlay: QuantumOverlay;
  facts: Record<string, unknown>[];
};

export function extractKernelResultFacts(
  overlay: QuantumOverlay
): Record<string, unknown>[] {
  return [
    { signature: overlay.signature },
    { curvature: overlay.curvature },
  ];
}

export function runInference(
  baseState: Record<string, unknown>
): InferenceArtifacts {
  const overlay: QuantumOverlay = {
    branches: [],
    curvature: 1,
    signature: "sha256:inference",
    collapsePolicy: "deterministic",
  };

  const facts = extractKernelResultFacts(overlay);
  return { overlay, facts };
}
