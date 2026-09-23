import type { Context, Hono } from "hono";
import type {
  Bindings,
  PortalKernelState,
  SimEvent,
  SimTecTaskState,
  SimTickDiff,
  SimWindowState,
} from "./types";

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
  | "inference";

type SimulationIntrospectionState = PortalKernelState & Readonly<{
  eventLog: ReadonlyArray<SimEvent>;
  diffLog: ReadonlyArray<SimTickDiff>;
  tecTasks: Readonly<Record<string, SimTecTaskState>>;
}>;

const KERNEL_OBJECT_NAME = "portal-kernel";
const SIMULATION_STATE_URL = "https://portal-kernel.invalid/kernel/sim/state";

const INTROSPECTION_ROUTES: ReadonlyArray<readonly [string, IntrospectionKind]> = [
  ["/api/introspection/sim/behavior", "sim.behavior"],
  ["/api/introspection/identity/timeline", "identity.timeline"],
  ["/api/introspection/windows/focus", "windows.focus"],
  ["/api/introspection/windows/state", "windows.state"],
  ["/api/introspection/windows/timeline", "windows.timeline"],
  ["/api/introspection/umbrella/enforcement", "umbrella.enforcement"],
  ["/api/introspection/kernel/heatmap", "kernel.heatmap"],
  ["/api/introspection/tec/pipeline", "tec.pipeline"],
  ["/api/introspection/substrate/state", "substrate.state"],
  ["/api/introspection/messages", "messages"],
  ["/api/introspection/logs", "logs"],
  ["/api/introspection/inference", "inference"],
];

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
]);

export function attachIntrospectionRoutes(
  app: Hono<{ Bindings: Bindings }>,
): void {
  for (const [path, kind] of INTROSPECTION_ROUTES) {
    app.get(path, (context: Context<{ Bindings: Bindings }>): Promise<Response> =>
      handleIntrospection(context, kind),
    );
  }
}

async function handleIntrospection(
  context: Context<{ Bindings: Bindings }>,
  kind: IntrospectionKind,
): Promise<Response> {
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
    return {
      deterministic: true,
      tick: state.tick,
      processedEvents: state.eventLog.length,
      reversibleDiffs: state.diffLog.length,
      lastDiff: state.diffLog.at(-1) ?? null,
    };
  }
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
    isRecord(value.tecTasks)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
