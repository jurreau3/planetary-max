//
// Planetary‑MAX Unified Substrate
// MAX‑Institute + Portal‑OS Wing
// Deterministic Global Canon + Quantum Collapse
//

import {
  QuantumBranch,
  QuantumOverlay,
  PlanetaryState,
  PlanetaryNodeSnapshot,
  PlanetarySynchronization,
  PlanetaryQuantumState,
  PlanetarySubstrate,
  PlanetaryCanon,
  PlanetaryIdentity,
  PlanetaryAnomaly,
  UmbrellaMode,
  GovernanceMetadata,
} from "./types";

import {
  generateQuantumOverlay,
  collapseQuantumBranches,
} from "./quantumn";

// -------------------------------------------------------------
// Initial Planetary State
// -------------------------------------------------------------

export function initialPlanetaryState(): PlanetaryState {
  return {
    nodes: [],
  };
}

// -------------------------------------------------------------
// Failure Detection
// -------------------------------------------------------------

export function isPlanetaryFailure(result: unknown): boolean {
  if (!result || typeof result !== "object") return true;
  return (result as any).error === true;
}

// -------------------------------------------------------------
// Parse Synchronization Packet
// -------------------------------------------------------------

export function parsePlanetarySynchronization(
  input: unknown
): PlanetarySynchronization {
  if (!input || typeof input !== "object") {
    return { branches: [], explicitSync: false };
  }

  const obj = input as any;

  return {
    branches: Array.isArray(obj.branches) ? obj.branches : [],
    explicitSync: Boolean(obj.explicitSync),
  };
}

// -------------------------------------------------------------
// Apply Synchronization
// -------------------------------------------------------------

export async function synchronizePlanetaryState(
  state: PlanetaryState,
  sync: PlanetarySynchronization,
  mode: UmbrellaMode = "strict"
): Promise<PlanetaryState> {
  const { branches, explicitSync } = sync;

  if (explicitSync && branches.length === 0) {
    return anomaly(state, "EXPLICIT_SYNC_EMPTY_BRANCH_SET");
  }

  if (branches.length === 0) {
    return state;
  }

  const overlay: QuantumOverlay = await generateQuantumOverlay(
    {},
    "planetary-sync",
    null,
    "deterministic"
  );

  const updatedNodes = state.nodes.map((node) =>
    applyPlanetaryQuantum(node, overlay, mode)
  );

  return {
    nodes: updatedNodes,
  };
}

// -------------------------------------------------------------
// Apply Quantum Collapse to a Node
// -------------------------------------------------------------

function applyPlanetaryQuantum(
  node: PlanetaryNodeSnapshot,
  overlay: QuantumOverlay,
  mode: UmbrellaMode
): PlanetaryNodeSnapshot {
  const branch = collapseQuantumBranches(overlay, undefined, {
    mode,
    identity: node.identity.id,
  });

  const nextQuantum: PlanetaryQuantumState = {
    overlay,
  };

  const nextSubstrate: PlanetarySubstrate = {
    stability: node.substrate.stability + (branch.stateDelta.stabilityDelta ?? 0),
  };

  const nextCanon: PlanetaryCanon = {
    truths: node.canon.truths,
    signature: overlay.signature,
  };

  return {
    ...node,
    quantum: nextQuantum,
    substrate: nextSubstrate,
    canon: nextCanon,
  };
}

// -------------------------------------------------------------
// Identity Signature Validation
// -------------------------------------------------------------

export function validatePlanetaryIdentity(
  identity: PlanetaryIdentity,
  mode: UmbrellaMode
): boolean {
  if (mode === "strict") {
    return typeof identity.signature === "string" && identity.signature.length > 0;
  }
  return true;
}

// -------------------------------------------------------------
// Anomaly Helper
// -------------------------------------------------------------

function anomaly(state: PlanetaryState, kind: string): PlanetaryState {
  const anomaly: PlanetaryAnomaly = { kind };
  return {
    ...state,
    anomaly,
  } as any;
}
