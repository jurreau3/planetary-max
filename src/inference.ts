import type {
  InferenceFact,
  InferenceHypothesis,
  InferenceRecommendation,
  KernelResult,
  PortalKernelState,
} from "./types";

export function extractFactsFromKernel(kernel: KernelResult): InferenceFact[] {
  const facts: InferenceFact[] = [];

  if (kernel.governance) {
    facts.push({
      id: "governance-mode",
      kind: "governance",
      payload: kernel.governance.mode,
    });
  }

  return facts;
}

export function raiseConfidenceFromBehavior(facts: InferenceFact[]): InferenceHypothesis {
  const confidence = facts.length > 2 ? 0.9 : facts.length > 0 ? 0.6 : 0.3;

  return {
    id: "behavior-hypothesis",
    facts,
    confidence,
  };
}

export function recommendSubstrateAdjustment(state: PortalKernelState): InferenceRecommendation {
  return {
    id: "substrate-recommendation",
    node: "substrate",
    probability: 0.8,
    curvature: -0.1,
    signature: `substrate:${state.substrate.stability}`,
  };
}

export function runInferenceFromKernel(
  kernel: KernelResult,
  state: PortalKernelState,
): { facts: InferenceFact[]; hypotheses: InferenceHypothesis[]; recommendations: InferenceRecommendation[] } {
  const facts = extractFactsFromKernel(kernel);
  const hypotheses = [raiseConfidenceFromBehavior(facts)];
  const recommendations = [recommendSubstrateAdjustment(state)];

  return { facts, hypotheses, recommendations };
}

export default { extractFactsFromKernel, raiseConfidenceFromBehavior, recommendSubstrateAdjustment, runInferenceFromKernel };
