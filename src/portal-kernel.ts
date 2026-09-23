import {
  QuantumOverlay,
  QuantumCollapsePolicy,
  GovernanceContext,
} from "./types";

import {
  generateQuantumOverlay,
  collapseQuantumBranches,
} from "./quantumn";

import {
  runInference,
  extractKernelResultFacts,
} from "./inference";

import {
  quantumGovernanceFromContext,
  governanceInferenceFromContext,
} from "./governance";

const QUANTUM_STATE_KEY = "portal.quantum.state";

export async function runPortalKernel(
  baseState: Record<string, unknown>,
  context: GovernanceContext
): Promise<Record<string, unknown>> {
  const policy: QuantumCollapsePolicy = quantumGovernanceFromContext(context);

  const overlay: QuantumOverlay = generateQuantumOverlay(baseState, policy);
  const collapsed = collapseQuantumBranches(overlay, policy);

  const inference = runInference(collapsed);
  const facts = extractKernelResultFacts(inference.overlay);

  return {
    ...collapsed,
    [QUANTUM_STATE_KEY]: {
      overlay,
      facts,
      governance: governanceInferenceFromContext(context),
    },
  };
}
