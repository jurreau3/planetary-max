import {
  QuantumOverlay,
  QuantumCollapsePolicy,
  GovernanceMetadata,
  GovernanceInference,
  GovernanceDecision,
  GovernanceContext,
  KernelEnvelope,
  KernelResult,
  PortalKernelState,
} from "./types";

import {
  generateQuantumOverlay,
  collapseQuantumBranches,
  quantumGovernanceFromContext,
} from "./quantumn";

import {
  runInference,
  extractKernelResultFacts,
} from "./inference";

import {
  governanceInferenceFromContext,
} from "./governance";

import {
  callKernel,
  readKernelResult,
  resultResponse,
  failureResponse,
} from "./kernel-bridge";

/**
 * PortalKernel type definition.
 * This is the unified kernel state returned to the Worker.
 */
export type PortalKernel = {
  overlay: QuantumOverlay;
  collapsed: Record<string, unknown>;
  facts: Record<string, unknown>[];
  governance: GovernanceMetadata[];
};

/**
 * Unified Portal‑OS Kernel execution pipeline.
 */
export async function runPortalKernel(
  baseState: Record<string, unknown>,
  context: GovernanceContext
): Promise<Record<string, unknown>> {
  // Determine collapse policy from governance context
  const policy: QuantumCollapsePolicy = quantumGovernanceFromContext({
    metadata: context.metadata ?? [],
    collapsePolicy: "deterministic",
  });

  // Generate quantum overlay
  const overlay: QuantumOverlay = generateQuantumOverlay(baseState, policy);

  // Collapse overlay into deterministic state
  const collapsed = collapseQuantumBranches(overlay, policy);

  // Run inference on collapsed state
  const inference = runInference(collapsed);
  const facts = extractKernelResultFacts(inference.overlay);

  // Governance inference
  const governance = governanceInferenceFromContext(context);

  // Unified kernel state
  const kernelState: PortalKernelState = {
    overlay,
    collapsed,
    facts,
    governance,
  };

  return {
    ...collapsed,
    "portal.quantum.state": kernelState,
  };
}
