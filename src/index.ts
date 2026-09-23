//
// Portal‑OS Unified Entry Point
// MAX‑Institute + Planetary‑MAX + Quantum Substrate
//

import {
  Bindings,
  GovernanceMetadata,
  KernelEnvelope,
  KernelResult,
  PlanetaryState,
  PlanetarySynchronization,
  QuantumGovernanceContext,
} from "./types";

import { dispatchKernelOperation } from "./portal-kernel";
import {
  initialPlanetaryState,
  isPlanetaryFailure,
  parsePlanetarySynchronization,
  synchronizePlanetaryState,
} from "./planetary";

import {
  deriveIdentityCurvature,
  generateQuantumBranches,
  quantumGovernanceFromContext,
  runInference,
} from "./quantumn";

export async function handleRequest(
  envelope: KernelEnvelope,
  planetary: PlanetaryState,
  bindings: Bindings,
  governance: GovernanceMetadata
): Promise<KernelResult> {
  const kernelResult = await dispatchKernelOperation(
    envelope,
    bindings.kernelState,
    governance
  );

  if (!kernelResult.ok) return kernelResult;

  const sync = parsePlanetarySynchronization(kernelResult.body);
  const nextPlanetary = await synchronizePlanetaryState(
    planetary,
    sync,
    governance.mode
  );

  return {
    ok: true,
    status: 200,
    body: {
      kernel: kernelResult.body,
      planetary: nextPlanetary,
    },
  };
}
