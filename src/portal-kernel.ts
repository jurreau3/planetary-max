//
// PortalKernel — Unified MAX‑Institute / Portal‑OS Simulation Engine
// Planetary‑MAX Quantum Substrate Integration
//

import {
  KernelEnvelope,
  KernelResult,
  PortalKernelState,
  SimEvent,
  SimEventType,
  SimAgentState,
  SimWindowState,
  SimTecTaskState,
  SimSubstrateState,
  SimTickDiff,
  QuantumOverlay,
  QuantumBranch,
  GovernanceMetadata,
  UmbrellaMode,
} from "./types";

import {
  collapseQuantumBranches,
  generateQuantumOverlay,
} from "./quantumn";

// -------------------------------------------------------------
// Initial Kernel State
// -------------------------------------------------------------

export function initialKernelState(): PortalKernelState {
  return {
    sim: {
      stability: 1,
    },
    windows: {},
    identity: {},
    tec: {},
    substrate: {
      stability: 1,
    },
  };
}

// -------------------------------------------------------------
// Envelope Dispatch
// -------------------------------------------------------------

export async function dispatchKernelOperation(
  envelope: KernelEnvelope,
  state: PortalKernelState,
  governance: GovernanceMetadata
): Promise<KernelResult> {
  if (!envelope || typeof envelope !== "object") {
    return failure("INVALID_ENVELOPE");
  }

  const lane = envelope.lane;

  switch (lane) {
    case "sim":
      return runSimulationTick(envelope, state, governance);

    case "identity":
      return runIdentityPhysics(envelope, state, governance);

    case "windows":
      return runWindowOperation(envelope, state, governance);

    case "tec":
      return runTecPipeline(envelope, state, governance);

    case "umbrella":
      return runUmbrellaIntrospection(envelope, state, governance);

    default:
      return failure("UNKNOWN_KERNEL_LANE");
  }
}

// -------------------------------------------------------------
// Simulation Tick
// -------------------------------------------------------------

async function runSimulationTick(
  envelope: KernelEnvelope,
  state: PortalKernelState,
  governance: GovernanceMetadata
): Promise<KernelResult> {
  const events = normalizeEvents(envelope.payload);

  const diff: SimTickDiff = {
    deltas: {},
    events,
  };

  const nextState = applySimulationDiff(state, diff, governance);

  return success(nextState);
}

function normalizeEvents(payload: unknown): SimEvent[] {
  if (!payload || typeof payload !== "object") return [];
  const arr = Array.isArray(payload) ? payload : [payload];
  return arr.map((p: any, idx) => ({
    id: p.id ?? `event-${idx}`,
    type: (p.type as SimEventType) ?? "agent.move",
    identityId: p.identityId ?? null,
    windowId: p.windowId ?? null,
    payload: p.payload ?? null,
  }));
}

function applySimulationDiff(
  state: PortalKernelState,
  diff: SimTickDiff,
  governance: GovernanceMetadata
): PortalKernelState {
  const next = structuredClone(state);

  for (const event of diff.events) {
    if (!governanceAllows(event, governance)) continue;
    applyEvent(next, event);
  }

  return next;
}

function applyEvent(state: PortalKernelState, event: SimEvent) {
  switch (event.type) {
    case "agent.move":
      applyAgentMove(state, event);
      break;

    case "window.focus":
      applyWindowFocus(state, event);
      break;

    case "tec.task":
      applyTecTask(state, event);
      break;

    case "substrate.adjust":
      applySubstrateAdjust(state, event);
      break;

    default:
      break;
  }
}

function applyAgentMove(state: PortalKernelState, event: SimEvent) {
  const id = event.identityId ?? "agent";
  const agent = (state.identity[id] ??= { id });
  agent.position = event.payload?.position ?? agent.position;
}

function applyWindowFocus(state: PortalKernelState, event: SimEvent) {
  const id = event.windowId ?? "window";
  const win = (state.windows[id] ??= { id, focusHistory: [], state: {} });
  win.focusHistory.push(event.id);
}

function applyTecTask(state: PortalKernelState, event: SimEvent) {
  const id = event.payload?.taskId ?? "task";
  const task = (state.tec[id] ??= { id, kind: "generic", progress: 0 });
  task.progress += event.payload?.delta ?? 0;
}

function applySubstrateAdjust(state: PortalKernelState, event: SimEvent) {
  state.substrate.stability += event.payload?.delta ?? 0;
}

// -------------------------------------------------------------
// Identity Physics
// -------------------------------------------------------------

async function runIdentityPhysics(
  envelope: KernelEnvelope,
  state: PortalKernelState,
  governance: GovernanceMetadata
): Promise<KernelResult> {
  const id = envelope.identity ?? "agent";
  const agent = (state.identity[id] ??= { id });

  agent.identity = envelope.payload?.identity ?? agent.identity;

  return success(state);
}

// -------------------------------------------------------------
// Window Operations
// -------------------------------------------------------------

async function runWindowOperation(
  envelope: KernelEnvelope,
  state: PortalKernelState,
  governance: GovernanceMetadata
): Promise<KernelResult> {
  const id = envelope.payload?.windowId ?? "window";
  const win = (state.windows[id] ??= { id, focusHistory: [], state: {} });

  win.state = {
    ...win.state,
    ...(envelope.payload?.state ?? {}),
  };

  return success(state);
}

// -------------------------------------------------------------
// TEC Pipeline
// -------------------------------------------------------------

async function runTecPipeline(
  envelope: KernelEnvelope,
  state: PortalKernelState,
  governance: GovernanceMetadata
): Promise<KernelResult> {
  const id = envelope.payload?.taskId ?? "task";
  const task = (state.tec[id] ??= { id, kind: "generic", progress: 0 });

  task.progress += envelope.payload?.delta ?? 0;

  return success(state);
}

// -------------------------------------------------------------
// Umbrella Introspection
// -------------------------------------------------------------

async function runUmbrellaIntrospection(
  envelope: KernelEnvelope,
  state: PortalKernelState,
  governance: GovernanceMetadata
): Promise<KernelResult> {
  return success({
    governance,
    identity: state.identity,
    windows: state.windows,
    substrate: state.substrate,
    tec: state.tec,
  });
}

// -------------------------------------------------------------
// Governance Rules
// -------------------------------------------------------------

function governanceAllows(event: SimEvent, governance: GovernanceMetadata) {
  if (governance.mode === "off") return true;
  if (governance.mode === "advisory") return true;
  if (governance.mode === "strict") {
    return event.type !== "substrate.adjust";
  }
  return true;
}

// -------------------------------------------------------------
// Quantum Integration
// -------------------------------------------------------------

export async function kernelTick(
  state: PortalKernelState,
  seed?: number
): Promise<PortalKernelState> {
  const overlay: QuantumOverlay | null = state.sim?.quantumOverlay ?? null;

  if (!overlay) return state;

  const branch: QuantumBranch = collapseQuantumBranches(overlay, seed);

  const nextSim = {
    ...state.sim,
    ...branch.stateDelta,
  };

  return {
    ...state,
    sim: nextSim,
  };
}

// -------------------------------------------------------------
// Kernel Result Helpers
// -------------------------------------------------------------

function success(body: unknown): KernelResult {
  return {
    ok: true,
    status: 200,
    body,
  };
}

function failure(reason: string): KernelResult {
  return {
    ok: false,
    status: 500,
    body: { error: true, reason },
  };
}
