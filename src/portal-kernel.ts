import { QuantumOverlay, QuantumBranch } from "./types";
import { QUANTUM_STATE_KEY, collapseQuantumBranches } from "./quantumn";

type KernelState = {
  planetary: Record<string, unknown>;
  sim: Record<string, unknown>;
};

export async function kernelTick(
  state: KernelState,
  seed?: number
): Promise<KernelState> {
  const overlay = state.planetary[QUANTUM_STATE_KEY] as QuantumOverlay | undefined;

  if (!overlay) {
    return runSimTick(state);
  }

  const branch: QuantumBranch = collapseQuantumBranches(overlay, seed);
  const nextSim = applyStateDelta(state.sim, branch.stateDelta);

  return {
    planetary: state.planetary,
    sim: nextSim,
  };
}

function runSimTick(state: KernelState): KernelState {
  return state;
}

function applyStateDelta(
  sim: Record<string, unknown>,
  delta: Readonly<Record<string, unknown>>
): Record<string, unknown> {
  return { ...sim, ...delta };
}
