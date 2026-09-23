import type { Context, Hono } from "hono";
import type {
  Bindings,
  EpistemicTimeline,
  InstituteState,
  PlanetaryState,
  PortalKernelState,
  QuantumOverlay,
  SimEvent,
  SimTecTaskState,
  SimTickDiff,
  SimWindowState,
} from "./types";
import { runInference } from "./inference";

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
  | "quantum.state"
  | "quantum.branches"
  | "quantum.curvature"
  | "quantum.signature"
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
  | "planetary.governance";

type SimulationIntrospectionState = PortalKernelState & Readonly<{
  eventLog: ReadonlyArray<SimEvent>;
  diffLog: ReadonlyArray<SimTickDiff>;
  tecTasks: Readonly<Record<string, SimTecTaskState>>;
  quantum: QuantumOverlay;
}>;

const KERNEL_OBJECT_NAME = "portal-kernel";
const SIMULATION_STATE_URL = "https://portal-kernel.invalid/kernel/sim/state";
const INSTITUTE_STATE_URL = "https://portal-kernel.invalid/kernel/institute/state";
const PLANETARY_STATE_URL = "https://portal-kernel.invalid/kernel/planetary/state";

const INSTITUTE_INTROSPECTION_KINDS: ReadonlySet<IntrospectionKind> =
  new Set<IntrospectionKind>([
    "institute.canon",
    "institute.truths",
    "institute.timeline",
    "institute.stability",
    "institute.signature",
    "institute.timelines",
  ]);

const PLANETARY_INTROSPECTION_KINDS: ReadonlySet<IntrospectionKind> =
  new Set<IntrospectionKind>([
    "planetary.identity",
    "planetary.substrate",
    "planetary.quantum",
    "planetary.canon",
    "planetary.governance",
  ]);

const SIMULATION_INTROSPECTION_KINDS: ReadonlySet<IntrospectionKind> = new Set<IntrospectionKind>([
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

export function attachIntrospectionRoutes(
  app: Hono<{ Bindings: Bindings }>,
): void {
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
  app.get("/api/introspection/quantum/state", introspectionHandler("quantum.state"));
  app.get("/api/introspection/quantum/branches", introspectionHandler("quantum.branches"));
  app.get("/api/introspection/quantum/curvature", introspectionHandler("quantum.curvature"));
  app.get("/api/introspection/quantum/signature", introspectionHandler("quantum.signature"));
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
}

function introspectionHandler(
  kind: IntrospectionKind,
): (context: Context<{ Bindings: Bindings }>) => Promise<Response> {
  return (context: Context<{ Bindings: Bindings }>): Promise<Response> =>
    handleIntrospection(context, kind);
}

async function handleIntrospection(
  context: Context<{ Bindings: Bindings }>,
  kind: IntrospectionKind,
): Promise<Response> {
  if (PLANETARY_INTROSPECTION_KINDS.has(kind)) {
    const state: PlanetaryState | Response = await readPlanetaryState(context.env);
    if (state instanceof Response) return state;
    return context.json({
      ok: true,
      introspection: kind,
      worker: "planetary-max",
      result: planetaryIntrospectionResult(kind, state),
    });
  }
  if (INSTITUTE_INTROSPECTION_KINDS.has(kind)) {
    const state: InstituteState | Response = await readInstituteState(context.env);
    if (state instanceof Response) return state;
    if (kind === "institute.signature") {
      const planetary: PlanetaryState | Response = await readPlanetaryState(context.env);
      if (planetary instanceof Response) return planetary;
      return context.json({
        ok: true,
        introspection: kind,
        worker: "planetary-max",
        result: {
          truths: instituteSignatureOverlays(state),
          planetary: {
            globalSignature: planetary.quantum.globalSignature,
            branches: planetary.quantum.branches,
          },
        },
      });
    }
    return context.json({
      ok: true,
      introspection: kind,
      worker: "planetary-max",
      result: instituteIntrospectionResult(kind, state, context.req.query("identityId")),
    });
  }
  if (!SIMULATION_INTROSPECTION_KINDS.has(kind)) {
    return context.json({ ok: true, introspection: kind, worker: "planetary-max" });
  }

  const state: SimulationIntrospectionState | Response = await readSimulationState(context.env);
  if (state instanceof Response) return state;
  return context.json({
    ok: true,
    introspection: kind,
    worker: "planetary-max",
    result: introspectionResult(kind, state),
  });
}

function instituteIntrospectionResult(
  kind: IntrospectionKind,
  state: InstituteState,
  identityId: string | undefined,
): unknown {
  if (kind === "institute.canon") return state.canon;
  if (kind === "institute.truths") {
    return Object.values(state.canon.truths).sort((left, right): number => compareOrdinal(left.id, right.id));
  }
  if (kind === "institute.timeline") {
    return identityId === undefined ? null : state.timelines[identityId] ?? null;
  }
  if (kind === "institute.stability") {
    return Object.fromEntries(Object.values(state.canon.truths)
      .sort((left, right): number => compareOrdinal(left.id, right.id))
      .map((truth): readonly [string, number] => [truth.id, truth.stability]));
  }
  return Object.values(state.timelines).sort(compareTimelines);
}

function planetaryIntrospectionResult(kind: IntrospectionKind, state: PlanetaryState): unknown {
  if (kind === "planetary.identity") return state.identities;
  if (kind === "planetary.substrate") return state.substrates;
  if (kind === "planetary.quantum") return state.quantum;
  if (kind === "planetary.canon") return state.canon;
  return { ...state.governance, advisories: state.advisories };
}

function instituteSignatureOverlays(
  state: InstituteState,
): Readonly<Record<string, ReadonlyArray<string>>> {
  const signatures: Record<string, string[]> = {};
  const events: EpistemicTimeline["events"] = Object.values(state.timelines)
    .flatMap((timeline: EpistemicTimeline): EpistemicTimeline["events"] => timeline.events)
    .sort((left, right): number => left.at - right.at || compareOrdinal(left.id, right.id));
  for (const event of events) {
    const overlays: unknown = event.meta.signatureOverlays;
    if (!Array.isArray(overlays)) continue;
    signatures[event.truthId] = [...new Set<string>(overlays.filter(
      (value: unknown): value is string => typeof value === "string" && value.length > 0,
    ))].sort(compareOrdinal);
  }
  return signatures;
}

async function readInstituteState(env: Bindings): Promise<InstituteState | Response> {
  try {
    const id: DurableObjectId = env.PORTAL_KERNEL.idFromName(KERNEL_OBJECT_NAME);
    const response: Response = await env.PORTAL_KERNEL.get(id).fetch(
      new Request(INSTITUTE_STATE_URL, { method: "GET" }),
    );
    const value: unknown = await response.json();
    if (!response.ok || !isRecord(value) || value.ok !== true || !isInstituteState(value.result)) {
      return introspectionFailure("PortalKernel returned an invalid Institute snapshot");
    }
    return value.result;
  } catch {
    return introspectionFailure("PortalKernel Institute snapshot is unavailable");
  }
}

async function readPlanetaryState(env: Bindings): Promise<PlanetaryState | Response> {
  try {
    const id: DurableObjectId = env.PORTAL_KERNEL.idFromName(KERNEL_OBJECT_NAME);
    const response: Response = await env.PORTAL_KERNEL.get(id).fetch(
      new Request(PLANETARY_STATE_URL, { method: "GET" }),
    );
    const value: unknown = await response.json();
    if (!response.ok || !isRecord(value) || value.ok !== true || !isPlanetaryState(value.result)) {
      return introspectionFailure("PortalKernel returned an invalid planetary snapshot");
    }
    return value.result;
  } catch {
    return introspectionFailure("PortalKernel planetary snapshot is unavailable");
  }
}

async function readSimulationState(
  env: Bindings,
): Promise<SimulationIntrospectionState | Response> {
  try {
    const id: DurableObjectId = env.PORTAL_KERNEL.idFromName(KERNEL_OBJECT_NAME);
    const response: Response = await env.PORTAL_KERNEL.get(id).fetch(
      new Request(SIMULATION_STATE_URL, { method: "GET" }),
    );
    const value: unknown = await response.json();
    if (!response.ok || !isRecord(value) || value.ok !== true || !isSimulationState(value.result)) {
      return Response.json(
        {
          ok: false,
          error: {
            code: "INTROSPECTION_FAILED",
            message: "PortalKernel returned an invalid simulation snapshot",
          },
        },
        { status: 503 },
      );
    }
    return value.result;
  } catch {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INTROSPECTION_FAILED",
          message: "PortalKernel simulation snapshot is unavailable",
        },
      },
      { status: 503 },
    );
  }
}

function introspectionResult(
  kind: IntrospectionKind,
  state: SimulationIntrospectionState,
): unknown {
  const windows: ReadonlyArray<SimWindowState> = Object.values(state.windows).sort(
    (left: SimWindowState, right: SimWindowState): number => compareOrdinal(left.id, right.id),
  );
  if (kind === "sim.behavior") {
    return {
      activeAgents: Object.keys(state.agents).length,
      hotspots: simulationHotspots(state),
      anomalies: state.substrate.anomalies.length,
      tick: state.tick,
    };
  }
  if (kind === "identity.timeline") {
    return state.eventLog
      .filter((event: SimEvent): boolean => event.identityId !== undefined)
      .map((event: SimEvent) => ({
        eventId: event.id,
        identityId: event.identityId,
        type: event.type,
        at: event.at,
      }));
  }
  if (kind === "windows.focus") {
    return windows
      .filter((window: SimWindowState): boolean => window.focus)
      .map((window: SimWindowState): string => window.id);
  }
  if (kind === "windows.state") return windows;
  if (kind === "windows.timeline") {
    return windows.flatMap((window: SimWindowState): ReadonlyArray<SimEvent> => window.history)
      .sort(compareEvents);
  }
  if (kind === "tec.pipeline") {
    return Object.values(state.tecTasks).sort(
      (left: SimTecTaskState, right: SimTecTaskState): number => compareOrdinal(left.id, right.id),
    );
  }
  if (kind === "substrate.state") return state.substrate;
  if (kind === "messages") return state.eventLog;
  if (kind === "logs") return state.diffLog;
  if (kind === "inference") {
    return runInference({ simulation: state, quantum: state.quantum });
  }
  if (kind === "quantum.state") return state.quantum.state;
  if (kind === "quantum.branches") return state.quantum.state.branches;
  if (kind === "quantum.curvature") return state.quantum.curvature;
  if (kind === "quantum.signature") return state.quantum.signatures;
  return {};
}

function simulationHotspots(
  state: SimulationIntrospectionState,
): ReadonlyArray<Readonly<{ x: number; y: number; agents: number }>> {
  const counts: Record<string, { x: number; y: number; agents: number }> = {};
  for (const agent of Object.values(state.agents)) {
    const key: string = `${agent.location.x}:${agent.location.y}`;
    const current: { x: number; y: number; agents: number } | undefined = counts[key];
    counts[key] = current === undefined
      ? { x: agent.location.x, y: agent.location.y, agents: 1 }
      : { ...current, agents: current.agents + 1 };
  }
  return Object.values(counts)
    .filter((hotspot): boolean => hotspot.agents > 1)
    .sort((left, right): number => left.x - right.x || left.y - right.y);
}

function compareEvents(left: SimEvent, right: SimEvent): number {
  return left.at - right.at || compareOrdinal(left.id, right.id);
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareTimelines(left: EpistemicTimeline, right: EpistemicTimeline): number {
  return compareOrdinal(left.identityId, right.identityId);
}

function introspectionFailure(message: string): Response {
  return Response.json(
    { ok: false, error: { code: "INTROSPECTION_FAILED", message } },
    { status: 503 },
  );
}

function isSimulationState(value: unknown): value is SimulationIntrospectionState {
  return (
    isRecord(value) &&
    isRecord(value.agents) &&
    isRecord(value.windows) &&
    isRecord(value.substrate) &&
    Array.isArray(value.events) &&
    typeof value.tick === "number" &&
    Array.isArray(value.eventLog) &&
    Array.isArray(value.diffLog) &&
    isRecord(value.tecTasks) &&
    isRecord(value.quantum)
  );
}

function isInstituteState(value: unknown): value is InstituteState {
  return (
    isRecord(value) &&
    isRecord(value.canon) &&
    isRecord(value.canon.truths) &&
    typeof value.canon.version === "number" &&
    typeof value.canon.updatedAt === "number" &&
    isRecord(value.timelines)
  );
}

function isPlanetaryState(value: unknown): value is PlanetaryState {
  return isRecord(value) && isRecord(value.identities) && isRecord(value.substrates) &&
    isRecord(value.quantum) && isRecord(value.canon) && isRecord(value.governance) &&
    typeof value.synchronizedAt === "number" && Array.isArray(value.advisories);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
