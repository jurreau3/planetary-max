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

import { runInference } from "./inference";
import { requireAuth } from "./auth";
import { isRecord } from "./utils";

export type IntrospectionKind =
  | "sim.behavior"
  | "identity.timeline"
  | "windows.focus"
  | "windows.state"
  | "windows.timeline"
  | "umbrella.enforcement"
  | "kernel.heatmap"
  | "tec.pipeline"
  | "substrate.state"
  | "messages"
  | "logs"
  | "inference"
  | "institute.canon"
  | "institute.truths"
  | "institute.timeline"
  | "institute.stability"
  | "institute.signature"
  | "institute.timelines"
  | "planetary.identity"
  | "planetary.substrate"
  | "planetary.quantum"
  | "planetary.canon"
  | "planetary.governance"
  | "planetary.state";

//
// Simulation Introspection State
//
export type SimulationIntrospectionState = PortalKernelState & Readonly<{
  eventLog: ReadonlyArray<SimEvent>;
  diffLog: ReadonlyArray<SimTickDiff>;
  tecTasks: Readonly<Record<string, SimTecTaskState>>;
  quantum: QuantumOverlay;
}>;

//
// Kernel DO endpoints
//
const KERNEL_OBJECT_NAME = "portal-kernel";
const SIMULATION_STATE_URL = "https://portal-kernel.invalid/kernel/sim/state";
const INSTITUTE_STATE_URL = "https://portal-kernel.invalid/kernel/institute/state";
const PLANETARY_STATE_URL = "https://portal-kernel.invalid/kernel/planetary/state";

//
// Introspection Kind Sets
//
const INSTITUTE_INTROSPECTION_KINDS = new Set<IntrospectionKind>([
  "institute.canon",
  "institute.truths",
  "institute.timeline",
  "institute.stability",
  "institute.signature",
  "institute.timelines",
]);

const PLANETARY_INTROSPECTION_KINDS = new Set<IntrospectionKind>([
  "planetary.identity",
  "planetary.substrate",
  "planetary.quantum",
  "planetary.canon",
  "planetary.governance",
  "planetary.state",
]);

const SIMULATION_INTROSPECTION_KINDS = new Set<IntrospectionKind>([
  "sim.behavior",
  "identity.timeline",
  "windows.focus",
  "windows.state",
  "windows.timeline",
  "tec.pipeline",
  "substrate.state",
  "messages",
  "logs",
  "inference",
  "quantum.state",
  "quantum.branches",
  "quantum.curvature",
  "quantum.signature",
]);

//
// Route Attachment
//
export function attachIntrospectionRoutes(app: Hono<{ Bindings: Bindings }>): void {
  app.get("/api/introspection/sim/behavior", introspectionHandler("sim.behavior"));
  app.get("/api/introspection/identity/timeline", introspectionHandler("identity.timeline"));
  app.get("/api/introspection/windows/focus", introspectionHandler("windows.focus"));
  app.get("/api/introspection/windows/state", introspectionHandler("windows.state"));
  app.get("/api/introspection/windows/timeline", introspectionHandler("windows.timeline"));
  app.get("/api/introspection/umbrella/enforcement", introspectionHandler("umbrella.enforcement"));
  app.get("/api/introspection/kernel/heatmap", introspectionHandler("kernel.heatmap"));
  app.get("/api/introspection/tec/pipeline", introspectionHandler("tec.pipeline"));
  app.get("/api/introspection/substrate/state", introspectionHandler("substrate.state"));
  app.get("/api/introspection/messages", introspectionHandler("messages"));
  app.get("/api/introspection/logs", introspectionHandler("logs"));
  app.get("/api/introspection/inference", introspectionHandler("inference"));
  app.get("/api/introspection/institute/canon", introspectionHandler("institute.canon"));
  app.get("/api/introspection/institute/truths", introspectionHandler("institute.truths"));
  app.get("/api/introspection/institute/timeline", introspectionHandler("institute.timeline"));
  app.get("/api/introspection/institute/stability", introspectionHandler("institute.stability"));
  app.get("/api/introspection/institute/signature", introspectionHandler("institute.signature"));
  app.get("/api/introspection/institute/timelines", introspectionHandler("institute.timelines"));
  app.get("/api/introspection/planetary/identity", introspectionHandler("planetary.identity"));
  app.get("/api/introspection/planetary/substrate", introspectionHandler("planetary.substrate"));
  app.get("/api/introspection/planetary/quantum", introspectionHandler("planetary.quantum"));
  app.get("/api/introspection/planetary/canon", introspectionHandler("planetary.canon"));
  app.get("/api/introspection/planetary/governance", introspectionHandler("planetary.governance"));
  app.get("/api/introspection/planetary/state", introspectionHandler("planetary.state"));
}

//
// Quantum Introspection
//
export function introspectQuantumState(global: Record<string, unknown>, ctx: AuthContext): QuantumOverlay | null {
  requireAuth(ctx);
  return (global[QUANTUM_STATE_KEY] as QuantumOverlay) ?? null;
}

export function introspectQuantumBranches(global: Record<string, unknown>, ctx: AuthContext) {
  const overlay = introspectQuantumState(global, ctx);
  return overlay ? overlay.branches : [];
}

export function introspectQuantumCurvature(global: Record<string, unknown>, ctx: AuthContext) {
  const overlay = introspectQuantumState(global, ctx);
  return overlay ? overlay.curvature : null;
}

export function introspectQuantumSignature(global: Record<string, unknown>, ctx: AuthContext) {
  const overlay = introspectQuantumState(global, ctx);
  return overlay ? overlay.signature : null;
}

//
// Planetary Introspection
//
function planetaryIntrospectionResult(kind: IntrospectionKind, state: PlanetaryState): unknown {
  if (kind === "planetary.identity") return state.identities;
  if (kind === "planetary.substrate") return state.substrate;
  if (kind === "planetary.quantum") return state.quantum;
  if (kind === "planetary.canon") return state.canon;
  if (kind === "planetary.governance") {
    return { ...state.governance, advisories: state.advisories };
  }
  return state;
}

export function introspectPlanetaryIdentity(planetary: PlanetaryState, ctx: AuthContext) {
  requireAuth(ctx);
  return planetary.nodes.map((n) => n.identity);
}

export function introspectPlanetarySubstrate(planetary: PlanetaryState, ctx: AuthContext) {
  requireAuth(ctx);
  return planetary.nodes.map((n) => n.substrate);
}

export function introspectPlanetaryQuantum(planetary: PlanetaryState, ctx: AuthContext) {
  requireAuth(ctx);
  return planetary.nodes.map((n) => n.quantum);
}

export function introspectPlanetaryGovernance(planetary: PlanetaryState, ctx: AuthContext) {
  requireAuth(ctx);
  return planetary.nodes.map((n) => ({
    identity: n.identity.id,
    signature: n.identity.signature,
  }));
}

//
// Simulation Introspection
//
export function introspectSimSubstrate(sim: Record<string, unknown>, ctx: AuthContext): SimSubstrateState | null {
  requireAuth(ctx);
  return (sim.substrate as SimSubstrateState) ?? null;
}

export function introspectSimWindows(sim: Record<string, unknown>, ctx: AuthContext): Record<string, SimWindowState> {
  requireAuth(ctx);
  return (sim.windows as Record<string, SimWindowState>) ?? {};
}

export function introspectSimIdentity(sim: Record<string, unknown>, ctx: AuthContext): Record<string, SimAgentState> {
  requireAuth(ctx);
  return (sim.identity as Record<string, SimAgentState>) ?? {};
}

export function introspectSimTecPipeline(sim: Record<string, unknown>, ctx: AuthContext): Record<string, SimTecTaskState> {
  requireAuth(ctx);
  return (sim.tec as Record<string, SimTecTaskState>) ?? {};
}

//
// Kernel Introspection
//
export function introspectKernelHeatmap(kernel: KernelResult, ctx: AuthContext) {
  requireAuth(ctx);
  return kernel.body ?? null;
}

export function introspectKernelMessages(kernel: KernelResult, ctx: AuthContext) {
  requireAuth(ctx);
  return kernel.body?.messages ?? [];
}

export function introspectKernelLogs(kernel: KernelResult, ctx: AuthContext) {
  requireAuth(ctx);
  return kernel.body?.logs ?? [];
}

export function introspectInferenceArtifacts(kernel: KernelResult, ctx: AuthContext) {
  requireAuth(ctx);
  return kernel.body?.inference ?? null;
}

//
// Institute Introspection
//
export function introspectInstituteCanon(institute: InstituteState, ctx: AuthContext): InstituteCanon {
  requireAuth(ctx);
  return institute.canon;
}

export function introspectInstituteTruths(institute: InstituteState, ctx: AuthContext) {
  requireAuth(ctx);
  return institute.canon.truths;
}

export function introspectInstituteTimeline(institute: InstituteState, ctx: AuthContext): EpistemicTimeline {
  requireAuth(ctx);
  return institute.timeline;
}

export function introspectInstituteStability(institute: InstituteState, ctx: AuthContext) {
  requireAuth(ctx);
  return institute.canon.truths.map((t) => ({
    id: t.id,
    stability: t.stability,
  }));
}

export function introspectInstituteSignature(institute: InstituteState, ctx: AuthContext) {
  requireAuth(ctx);
  return institute.canon.signature;
}

export function introspectInstituteTimelines(institute: InstituteState, ctx: AuthContext) {
  requireAuth(ctx);
  return {
    timeline: institute.timeline,
    truths: institute.canon.truths,
  };
}
