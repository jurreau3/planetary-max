import { QuantumBranch, QuantumOverlay } from "./types";
import { generateQuantumOverlay, QUANTUM_STATE_KEY } from "./quantumn";

export type PlanetarySyncPacket = {
  branches: QuantumBranch[];
  explicitSync: boolean;
};

export async function applyPlanetaryQuantumSync(
  state: Record<string, unknown>,
  packet: PlanetarySyncPacket
): Promise<Record<string, unknown>> {
  const { branches, explicitSync } = packet;

  if (explicitSync && branches.length === 0) {
    throw new Error("EXPLICIT_SYNC_EMPTY_BRANCH_SET_DENIED");
  }

  if (branches.length === 0) {
    return state;
  }

  const overlay: QuantumOverlay = await generateQuantumOverlay(
    branches,
    "deterministic"
  );

  return {
    ...state,
    [QUANTUM_STATE_KEY]: overlay,
  };
}
