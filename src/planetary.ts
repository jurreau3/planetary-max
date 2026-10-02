import type {
  PlanetaryCanon,
  PlanetaryGovernanceContext,
  PlanetaryIdentity,
  PlanetaryNodeSnapshot,
  PlanetaryQuantumState,
  PlanetaryState,
  PlanetarySubstrate,
  PlanetarySynchronization,
} from "./types";

export type PlanetaryFailure = Readonly<{ code: string; message: string }>;

export function initialPlanetaryState(): PlanetaryState {
  return { nodes: [] };
}

export function synchronizePlanetaryState(synchronization: PlanetarySynchronization): PlanetaryState {
  return { nodes: synchronization.nodes ?? [] };
}

export function planetaryNodeFromSnapshot(snapshot: PlanetaryNodeSnapshot): PlanetaryNodeSnapshot {
  const identity: PlanetaryIdentity = snapshot.identity ?? { id: "unknown", signature: "unknown" };
  const substrate: PlanetarySubstrate = snapshot.substrate ?? { stability: 0 };
  const quantum: PlanetaryQuantumState = snapshot.quantum ?? { overlay: null };
  const canon: PlanetaryCanon = snapshot.canon ?? { truths: [], signature: "" };

  return {
    id: snapshot.id ?? snapshot.nodeId ?? identity.id,
    identity,
    substrate,
    quantum,
    canon,
  };
}

export function planetaryMerge(
  state: PlanetaryState,
  synchronization: PlanetarySynchronization,
  governance: PlanetaryGovernanceContext = { mode: "strict" },
): PlanetaryState {
  return {
    ...state,
    nodes: synchronization.nodes ?? state.nodes,
    governance,
  };
}

export const executePlanetaryTick = synchronizePlanetaryState;

export function isPlanetaryFailure(value: unknown): value is PlanetaryFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as any).code === "INVALID_PLANETARY_STATE" &&
    typeof (value as any).message === "string"
  );
}

export default {
  initialPlanetaryState,
  synchronizePlanetaryState,
  planetaryNodeFromSnapshot,
  planetaryMerge,
  executePlanetaryTick,
  isPlanetaryFailure,
};
