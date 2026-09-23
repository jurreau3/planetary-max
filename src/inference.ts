import {
  InferenceArtifacts,
  InferenceFact,
  InferenceFactKind,
  InferenceHypothesis,
  InferenceRecommendation,
  QuantumOverlay,
  QuantumBranch,
  SimEvent,
  SimAgentState,
  SimWindowState,
  SimSubstrateState,
} from "./types";

/**
 * Extract facts from the quantum overlay.
 */
export function extractQuantumFacts(overlay: QuantumOverlay): InferenceFact[] {
  return [
    {
      kind: "quantum",
      data: {
        signature: overlay.signature,
        curvature: overlay.curvature,
        branches: overlay.branches.map((b: QuantumBranch) => ({
          id: b.id,
          probability: b.probability,
          signature: b.signature,
        })),
      },
    },
  ];
}

/**
 * Extract simulation facts from a simulation tick.
 */
export function extractSimulationFacts(
  events: SimEvent[],
  agents: SimAgentState[],
  windows: SimWindowState[],
  substrate: SimSubstrateState,
): InferenceFact[] {
  return [
    {
      kind: "simulation",
      data: {
        events,
        agents,
        windows,
        substrate,
      },
    },
  ];
}

/**
 * Extract kernel result facts from the overlay.
 */
export function extractKernelResultFacts(
  overlay: QuantumOverlay
): InferenceFact[] {
  return [
    {
      kind: "quantum",
      data: {
        signature: overlay.signature,
        curvature: overlay.curvature,
      },
    },
  ];
}

/**
 * Detect inference patterns from facts.
 */
export function detectInferencePatterns(
  facts: InferenceFact[]
): InferenceHypothesis[] {
  return facts.map((fact, index) => ({
    id: `hypothesis-${index}`,
    confidence: 0.5,
    facts: [fact],
  }));
}

/**
 * Generate recommendations from hypotheses.
 */
export function generateInferenceRecommendations(
  hypotheses: InferenceHypothesis[]
): InferenceRecommendation[] {
  return hypotheses.map((h) => ({
    target: "quantum",
    action: "adjust-curvature",
    rationale: `Based on hypothesis ${h.id} with confidence ${h.confidence}`,
  }));
}

/**
 * Unified inference pipeline.
 */
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
