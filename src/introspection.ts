//
// Unified Introspection Layer
// MAX‑Institute + Portal‑OS Wing
// Planetary‑MAX Quantum Substrate
//

import {
  QuantumOverlay,
  PlanetaryState,
  PlanetaryNodeSnapshot,
  InstituteState,
  KernelResult,
  SimSubstrateState,
  SimWindowState,
  SimAgentState,
  SimTecTaskState,
  EpistemicTimeline,
  InstituteCanon,
} from "./types";

import { QUANTUM_STATE_KEY } from "./quantumn";

// -------------------------------------------------------------
// Auth Context
// -------------------------------------------------------------

type AuthContext = {
  identity: string | null;
};

function requireAuth(ctx: AuthContext) {
  if (!ctx.identity) {
    throw new Error("UNAUTHENTICATED_INTROSPECTION");
  }
}

// -------------------------------------------------------------
// Quantum Introspection
// -------------------------------------------------------------

export function introspectQuantumState(
  global: Record<string, unknown>,
  ctx: AuthContext
): QuantumOverlay | null {
  requireAuth(ctx);
  return (global[QUANTUM_STATE_KEY] as QuantumOverlay) ?? null;
}

export function introspectQuantumBranches(
  global: Record<string, unknown>,
  ctx: AuthContext
) {
  const overlay = introspectQuantumState(global, ctx);
  return overlay ? overlay.branches : [];
}

export function introspectQuantumCurvature(
  global: Record<string, unknown>,
  ctx: AuthContext
) {
  const overlay = introspectQuantumState(global, ctx);
  return overlay ? overlay.curvature : null;
}

export function introspectQuantumSignature(
  global: Record<string, unknown>,
  ctx: AuthContext
) {
  const overlay = introspectQuantumState(global, ctx);
  return overlay ? overlay.signature : null;
}

// -------------------------------------------------------------
// Simulation Introspection
// -------------------------------------------------------------

export function introspectSimBehavior(
  sim: Record<string, unknown>,
  ctx: AuthContext
) {
  requireAuth(ctx);
  return sim.behavior ?? null;
}

export function introspectSimSubstrate(
  sim: Record<string, unknown>,
  ctx: AuthContext
): SimSubstrateState | null {
  requireAuth(ctx);
  return (sim.substrate as SimSubstrateState) ?? null;
}

export function introspectSimWindows(
  sim: Record<string, unknown>,
  ctx: AuthContext
): Record<string, SimWindowState> {
  requireAuth(ctx);
  return (sim.windows as Record<string, SimWindowState>) ?? {};
}

export function introspectSimIdentity(
  sim: Record<string, unknown>,
  ctx: AuthContext
): Record<string, SimAgentState> {
  requireAuth(ctx);
  return (sim.identity as Record<string, SimAgentState>) ?? {};
}

export function introspectSimTecPipeline(
  sim: Record<string, unknown>,
  ctx: AuthContext
): Record<string, SimTecTaskState> {
  requireAuth(ctx);
  return (sim.tec as Record<string, SimTecTaskState>) ?? {};
}

// -------------------------------------------------------------
// Kernel Introspection
// -------------------------------------------------------------

export function introspectKernelHeatmap(
  kernel: KernelResult,
  ctx: AuthContext
) {
  requireAuth(ctx);
  return kernel.body ?? null;
}

export function introspectKernelMessages(
  kernel: KernelResult,
  ctx: AuthContext
) {
  requireAuth(ctx);
  return kernel.body?.messages ?? [];
}

export function introspectKernelLogs(
  kernel: KernelResult,
  ctx: AuthContext
) {
  requireAuth(ctx);
  return kernel.body?.logs ?? [];
}

export function introspectInferenceArtifacts(
  kernel: KernelResult,
  ctx: AuthContext
) {
  requireAuth(ctx);
  return kernel.body?.inference ?? null;
}

// -------------------------------------------------------------
// Institute Introspection
// -------------------------------------------------------------

export function introspectInstituteCanon(
  institute: InstituteState,
  ctx: AuthContext
): InstituteCanon {
  requireAuth(ctx);
  return institute.canon;
}

export function introspectInstituteTruths(
  institute: InstituteState,
  ctx: AuthContext
) {
  requireAuth(ctx);
  return institute.canon.truths;
}

export function introspectInstituteTimeline(
  institute: InstituteState,
  ctx: AuthContext
): EpistemicTimeline {
  requireAuth(ctx);
  return institute.timeline;
}

export function introspectInstituteStability(
  institute: InstituteState,
  ctx: AuthContext
) {
  requireAuth(ctx);
  return institute.canon.truths.map((t) => ({
    id: t.id,
    stability: t.stability,
  }));
}

export function introspectInstituteSignature(
  institute: InstituteState,
  ctx: AuthContext
) {
  requireAuth(ctx);
  return institute.canon.signature;
}

export function introspectInstituteTimelines(
  institute: InstituteState,
  ctx: AuthContext
) {
  requireAuth(ctx);
  return {
    timeline: institute.timeline,
    truths: institute.canon.truths,
  };
}

// -------------------------------------------------------------
// Planetary Introspection
// -------------------------------------------------------------

export function introspectPlanetaryIdentity(
  planetary: PlanetaryState,
  ctx: AuthContext
) {
  requireAuth(ctx);
  return planetary.nodes.map((n) => n.identity);
}

export function introspectPlanetarySubstrate(
  planetary: PlanetaryState,
  ctx: AuthContext
) {
  requireAuth(ctx);
  return planetary.nodes.map((n) => n.substrate);
}

export function introspectPlanetaryQuantum(
  planetary: PlanetaryState,
  ctx: AuthContext
) {
  requireAuth(ctx);
  return planetary.nodes.map((n) => n.quantum);
}

export function introspectPlanetaryCanon(
  planetary: PlanetaryState,
  ctx: AuthContext
) {
  requireAuth(ctx);
  return planetary.nodes.map((n) => n.canon);
}

export function introspectPlanetaryGovernance(
  planetary: PlanetaryState,
  ctx: AuthContext
) {
  requireAuth(ctx);
  return planetary.nodes.map((n) => ({
    identity: n.identity.id,
    signature: n.identity.signature,
  }));
}
