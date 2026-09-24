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
  formInstituteTruth,
  initialInstituteState,
  isInstituteFormationFailure,
  parseTruthFormation,
  type InstituteFormationFailure,
  type InstituteFormationResult,
  type InstituteTruthGovernance,
} from "./institute";
import {
  initialPlanetaryState,
  executePlanetaryRuntime,
  isPlanetaryFailure,
  parsePlanetarySynchronization,
  synchronizePlanetaryRuntime,
  type PlanetaryFailure,
} from "./planetary";

type UniverseState = Readonly<{
  tick: number;
  properties: Readonly<Record<string, unknown>>;
  lastOperation: Readonly<{ messageId: string; type: string }> | null;
}>;

type SimulationAuxiliaryState = Readonly<{
  eventLog: ReadonlyArray<SimEvent>;
  diffLog: ReadonlyArray<SimTickDiff>;
  tecTasks: Readonly<Record<string, SimTecTaskState>>;
  quantum: QuantumOverlay;
}>;

type SimulationSnapshot = PortalKernelState & SimulationAuxiliaryState;

type SimulationMeta = Readonly<{
  entityId: string;
  kind: "agent" | "window" | "substrate" | "tec" | "simulation";
  tickVersion: number;
}>;

type DispatchOutput = Readonly<{
  data: Readonly<Record<string, unknown>>;
  sim?: SimulationMeta;
  governance?: Readonly<Record<string, unknown>>;
}>;

type SimulationFailure = Readonly<{
  ok: false;
  status: number;
  code: string;
  message: string;
  meta?: Readonly<Record<string, unknown>>;
}>;

type EnqueueSuccess = Readonly<{
  ok: true;
  result: Readonly<Record<string, unknown>>;
  sim: SimulationMeta;
  governance: Readonly<Record<string, unknown>>;
}>;

type TickSuccess = Readonly<{
  result: Readonly<{
    tick: number;
    diff: SimTickDiff;
    snapshot: PortalKernelState;
    quantum: QuantumOverlay;
  }>;
  sim: SimulationMeta;
}>;

type QuantumTickOptions = Readonly<{
  seed?: string | number;
  collapsePolicy?: QuantumCollapsePolicy;
  governanceContext?: Readonly<Record<string, unknown>>;
}>;

type AppliedEvent = Readonly<{
  state: PortalKernelState;
  tecTasks: Readonly<Record<string, SimTecTaskState>>;
  change: SimDiffEntry;
}>;

const UNIVERSE_STATE_KEY = "universe";
const SIMULATION_STATE_KEY = "simulation";
const SIMULATION_EVENT_LOG_KEY = "simulation-event-log";
const SIMULATION_DIFF_LOG_KEY = "simulation-diff-log";
const SIMULATION_TEC_TASKS_KEY = "simulation-tec-tasks";
const INSTITUTE_STATE_KEY = "institute";
const PLANETARY_STATE_KEY = "planetary";
const INTROSPECTION_PREFIX = "introspection.";
const MAX_QUEUED_EVENTS = 1_000;
const MAX_EVENT_LOG_ENTRIES = 200;
const MAX_DIFF_LOG_ENTRIES = 100;
const MAX_ENTITY_HISTORY_ENTRIES = 200;
const MAX_EVENT_PAYLOAD_BYTES = 65_536;
const MAX_SIMULATION_STATE_BYTES = 650_000;
const MAX_STORAGE_VALUE_BYTES = 1_500_000;

const SIM_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  "agent.move",
  "agent.goal.update",
  "window.focus",
  "window.layout.change",
  "substrate.shift",
  "substrate.anomaly",
  "substrate.quantum.shift",
  "substrate.quantum.branch",
  "substrate.quantum.collapse",
  "tec.task.created",
  "tec.task.completed",
]);

const SIM_TICK_MESSAGE_TYPES: ReadonlySet<string> = new Set<string>([
  "sim.agent.tick",
  "sim.window.tick",
  "sim.substrate.tick",
  "sim.tec.pipeline.tick",
]);

const SIM_COMMAND_MESSAGE_TYPES: ReadonlySet<string> = new Set<string>([
  "sim.agent.command",
  "sim.window.command",
  "sim.substrate.event",
]);

export class PortalKernel {
  public constructor(
    private readonly state: DurableObjectState,
    private readonly env: KernelEnvironment,
  ) {}

  public async fetch(request: Request): Promise<Response> {
    const url: URL = new URL(request.url);

    if (url.pathname === "/kernel/sim/state") {
      return request.method === "GET"
        ? this.simulationStateResponse()
        : failureResponse("METHOD_NOT_ALLOWED", "Simulation state requires GET", 405);
    }
    if (url.pathname === "/kernel/sim/event") {
      return request.method === "POST"
        ? this.simulationEventResponse(request)
        : failureResponse("METHOD_NOT_ALLOWED", "Simulation events require POST", 405);
    }
    if (url.pathname === "/kernel/sim/tick") {
      return request.method === "POST"
        ? this.simulationTickResponse(request)
        : failureResponse("METHOD_NOT_ALLOWED", "Simulation ticks require POST", 405);
    }
    if (url.pathname === "/kernel/institute/state") {
      return request.method === "GET"
        ? this.instituteStateResponse()
        : failureResponse("METHOD_NOT_ALLOWED", "Institute state requires GET", 405);
    }
    if (url.pathname === "/kernel/planetary/state") {
      return request.method === "GET"
        ? this.planetaryStateResponse()
        : failureResponse("METHOD_NOT_ALLOWED", "Planetary state requires GET", 405);
    }
    if (url.pathname !== "/api/kernel/message") {
      return Response.json({ status: "ok", service: "portal-kernel" });
    }
    if (request.method !== "POST") {
      return failureResponse("METHOD_NOT_ALLOWED", "Kernel messages require POST", 405);
    }

    const body: Record<string, unknown> | Response = await readJsonObject(
      request,
      "Kernel envelope must be JSON",
    );
    if (body instanceof Response) return body;

    const envelope: KernelEnvelope | Response = validateEnvelope(body);
    if (envelope instanceof Response) return envelope;

    const governance: GovernanceMetadata = evaluateGovernance(
      envelope,
      this.env.UMBRELLA_ENFORCEMENT,
    );
    if (governance.decision === "denied") {
      return Response.json(
        {
          ok: false,
          error: {
            code: "FORBIDDEN",
            message: "Umbrella governance denied the operation",
          },
          meta: {
            messageId: envelope.id,
            type: envelope.type,
            governance,
          },
        },
        { status: 403 },
      );
    }

    const dispatched: DispatchOutput | Response = await this.dispatch(envelope, governance);
    if (dispatched instanceof Response) return dispatched;

    const lane: KernelLane = makeLane(
      laneForType(envelope.type),
      dispatched.data,
      "PortalKernel",
      governance.mode,
    );
    return Response.json({
      ok: true,
      result: dispatched.data,
      data: dispatched.data,
      lanes: [lane],
      meta: {
        messageId: envelope.id,
        type: envelope.type,
        umbrella: umbrellaUpdateName(envelope.type),
        identity: { propagated: true },
        governance: dispatched.governance ?? governance,
        ...(dispatched.sim === undefined ? {} : { sim: dispatched.sim }),
      },
    });
  }

  private async dispatch(
    envelope: KernelEnvelope,
    governance: GovernanceMetadata,
  ): Promise<DispatchOutput | Response> {
    if (SIM_COMMAND_MESSAGE_TYPES.has(envelope.type)) {
      const eventValue: unknown = isRecord(envelope.payload.event)
        ? envelope.payload.event
        : envelope.payload;
      if (!isRecord(eventValue) || !commandAcceptsEvent(envelope.type, eventValue.type)) {
        return failureResponse(
          "INVALID_MESSAGE",
          "Simulation command event type does not match the command",
          400,
        );
      }
      const outcome: EnqueueSuccess | SimulationFailure = await this.enqueueSimulationEvent(
        eventValue,
        envelope.governanceContext,
        envelope.identity,
      );
      return outcome.ok
        ? {
            data: outcome.result,
            sim: outcome.sim,
            governance: outcome.governance,
          }
        : simulationFailureResponse(outcome);
    }

    if (SIM_TICK_MESSAGE_TYPES.has(envelope.type)) {
      const options: QuantumTickOptions | SimulationFailure = quantumTickOptions(
        envelope.payload,
        envelope.governanceContext,
      );
      if (isSimulationFailure(options)) return simulationFailureResponse(options);
      const tick: TickSuccess | SimulationFailure = await this.tickSimulation(options);
      if (isSimulationFailure(tick)) return simulationFailureResponse(tick);
      const entityId: string =
        typeof envelope.payload.entityId === "string"
          ? envelope.payload.entityId
          : tick.sim.entityId;
      const kind: SimulationMeta["kind"] = simulationKindForMessage(envelope.type);
      const entity: unknown = selectSimulationEntity(tick.result.snapshot, kind, entityId);
      return {
        data: {
          ...tick.result,
          entity,
        },
        sim: {
          entityId,
          kind,
          tickVersion: simulationTickVersion(entity, tick.result.diff, kind, tick.result.tick),
        },
      };
    }

    if (envelope.type === "institute.truth.form") {
      return this.formInstituteTruth(envelope, governance);
    }
    if (envelope.type === "institute.canon.state") {
      const state: InstituteState = await this.readInstituteState();
      return { data: { canon: state.canon } };
    }
    if (envelope.type === "institute.timeline.state") {
      const state: InstituteState = await this.readInstituteState();
      const timeline: EpistemicTimeline = state.timelines[envelope.identity] ?? {
        identityId: envelope.identity,
        events: [],
      };
      return { data: { timeline } };
    }
    if (envelope.type === "planetary.sync" || envelope.type === "planetary.tick") {
      return this.synchronizePlanetary(envelope);
    }
    if (envelope.type === "planetary.state") {
      return { data: { state: await this.readPlanetaryState() } };
    }

    if (envelope.type.startsWith(INTROSPECTION_PREFIX)) {
      return { data: this.introspectionSnapshot(envelope, governance) };
    }
    if (envelope.type === "universe.state") return { data: await this.readUniverse() };
    if (envelope.type === "universe.tick") return { data: await this.tickUniverse(envelope) };
    if (envelope.type === "universe.umbrella") {
      return {
        data: {
          umbrellaMode: governance.mode,
          osPermissions: {},
          osIdentity: { authenticated: true },
          osGovernanceFlags: {},
          osTruthInvariants: { structuralTruth: true },
        },
      };
    }
    if (envelope.type === "identity.physics.license") {
      return {
        data: {
          osIdentity: { authenticated: true, physicsApplied: true },
          subject: envelope.identity,
        },
      };
    }
    if (envelope.type === "umbrella.os") {
      return {
        data: {
          osPermissions: isRecord(envelope.payload.permissions)
            ? envelope.payload.permissions
            : {},
          osIdentity: {},
          osGovernanceFlags: {},
          osTruthInvariants: {},
        },
      };
    }
    return {
      data: {
        kernel: "Portal-OS Kernel Engine",
        operation: envelope.type,
        accepted: true,
      },
    };
  }

  private async simulationEventResponse(request: Request): Promise<Response> {
    const body: Record<string, unknown> | Response = await readJsonObject(
      request,
      "Simulation event must be a JSON object",
    );
    if (body instanceof Response) return body;

    const eventValue: unknown = isRecord(body.event) ? body.event : body;
    const governanceContext: Readonly<Record<string, unknown>> = isRecord(body.governanceContext)
      ? body.governanceContext
      : {};
    const outcome: EnqueueSuccess | SimulationFailure = await this.enqueueSimulationEvent(
      eventValue,
      governanceContext,
    );
    return outcome.ok
      ? Response.json({
          ok: true,
          result: outcome.result,
          meta: { sim: outcome.sim, governance: outcome.governance },
        })
      : simulationFailureResponse(outcome);
  }

  private async simulationTickResponse(request: Request): Promise<Response> {
    let body: Readonly<Record<string, unknown>> = {};
    if (request.body !== null) {
      const value: Record<string, unknown> | Response = await readJsonObject(
        request,
        "Simulation tick options must be a JSON object",
      );
      if (value instanceof Response) return value;
      body = value;
    }
    const context: Readonly<Record<string, unknown>> = isRecord(body.governanceContext)
      ? body.governanceContext
      : {};
    const options: QuantumTickOptions | SimulationFailure = quantumTickOptions(body, context);
    if (isSimulationFailure(options)) return simulationFailureResponse(options);
    const tick: TickSuccess | SimulationFailure = await this.tickSimulation(options);
    return isSimulationFailure(tick)
      ? simulationFailureResponse(tick)
      : Response.json({ ok: true, result: tick.result, meta: { sim: tick.sim } });
  }

  private async simulationStateResponse(): Promise<Response> {
    const snapshot: SimulationSnapshot = await this.readSimulationSnapshot();
    return Response.json({
      ok: true,
      result: snapshot,
      meta: {
        sim: {
          entityId: "simulation",
          kind: "simulation",
          tickVersion: snapshot.tick,
        },
      },
    });
  }

  private async instituteStateResponse(): Promise<Response> {
    return Response.json({ ok: true, result: await this.readInstituteState() });
  }

  private async planetaryStateResponse(): Promise<Response> {
    return Response.json({ ok: true, result: await this.readPlanetaryState() });
  }

  private async synchronizePlanetary(envelope: KernelEnvelope): Promise<DispatchOutput | Response> {
    if (envelope.payload.seed !== undefined && typeof envelope.payload.seed !== "string") {
      return failureResponse("INVALID_PLANETARY_STATE", "Planetary collapse seed must be a string", 400);
    }
    const synchronization = parsePlanetarySynchronization(envelope.payload, envelope.identity);
    if (isPlanetaryFailure(synchronization)) {
      return failureResponse(synchronization.code, synchronization.message, 400);
    }
    const result: PlanetaryState | PlanetaryFailure = envelope.type === "planetary.tick"
      ? await executePlanetaryRuntime(
        synchronization,
        typeof envelope.payload.seed === "string" ? envelope.payload.seed : undefined,
      )
      : await synchronizePlanetaryRuntime(synchronization);
    if (isPlanetaryFailure(result)) {
      const status: number = result.code === "INVALID_PLANETARY_STATE" ? 400 : 403;
      return failureResponse(result.code, result.message, status);
    }
    if (jsonSize(result) > MAX_STORAGE_VALUE_BYTES) {
      return failureResponse("PLANETARY_STATE_LIMIT", "Planetary state exceeds the durable storage limit", 413);
    }
    await this.state.storage.put(PLANETARY_STATE_KEY, result);
    return { data: { state: result } };
  }

  private async formInstituteTruth(
    envelope: KernelEnvelope,
    governance: GovernanceMetadata,
  ): Promise<DispatchOutput | Response> {
    if (
      envelope.governanceContext.stabilityThreshold !== undefined &&
      !finiteNumber(envelope.governanceContext.stabilityThreshold)
    ) {
      return failureResponse("INVALID_INSTITUTE_EVIDENCE", "stabilityThreshold must be numeric", 400);
    }
    if (
      envelope.governanceContext.curvatureLimit !== undefined &&
      !finiteNumber(envelope.governanceContext.curvatureLimit)
    ) {
      return failureResponse("INVALID_INSTITUTE_EVIDENCE", "curvatureLimit must be numeric", 400);
    }
    const formation = parseTruthFormation(envelope.payload, envelope.identity);
    if ("code" in formation) {
      return failureResponse(formation.code, formation.message, 400);
    }
    return this.state.storage.transaction(
      async (transaction: DurableObjectTransaction): Promise<DispatchOutput | Response> => {
        const current: InstituteState =
          (await transaction.get<InstituteState>(INSTITUTE_STATE_KEY)) ?? initialInstituteState();
        const truthGovernance: InstituteTruthGovernance = {
          mode: governance.mode,
          ...(finiteNumber(envelope.governanceContext.stabilityThreshold)
            ? { stabilityThreshold: envelope.governanceContext.stabilityThreshold }
            : {}),
          ...(finiteNumber(envelope.governanceContext.curvatureLimit)
            ? { curvatureLimit: envelope.governanceContext.curvatureLimit }
            : {}),
        };
        const result: InstituteFormationResult | InstituteFormationFailure =
          formInstituteTruth(current, formation, truthGovernance);
        if (isInstituteFormationFailure(result)) {
          const status: number = result.code === "INSTITUTE_GOVERNANCE_DENIED"
            ? 403
            : result.code === "UNSTABLE_INSTITUTE_PATTERN"
              ? 422
              : 400;
          return failureResponse(result.code, result.message, status);
        }
        await transaction.put(INSTITUTE_STATE_KEY, result.state);
        return {
          data: {
            truth: result.truth,
            ...(result.event === undefined ? {} : { epistemicEvent: result.event }),
            canonVersion: result.state.canon.version,
            changed: result.changed,
          },
        };
      },
    );
  }

  private async enqueueSimulationEvent(
    value: unknown,
    governanceContext: Readonly<Record<string, unknown>>,
    expectedIdentity?: string,
  ): Promise<EnqueueSuccess | SimulationFailure> {
    const parsed: SimEvent | SimulationFailure = validateSimulationEvent(value, expectedIdentity);
    if (isSimulationFailure(parsed)) return parsed;
    const event: SimEvent = parsed;

    const governance: Readonly<Record<string, unknown>> = evaluateEventGovernance(
      event,
      governanceContext,
      this.env.UMBRELLA_ENFORCEMENT,
    );
    if (governance.decision === "denied") {
      return {
        ok: false,
        status: 403,
        code: "FORBIDDEN",
        message: "Umbrella governance denied the simulation event",
        meta: { governance },
      };
    }

    return this.state.storage.transaction(
      async (transaction: DurableObjectTransaction): Promise<EnqueueSuccess | SimulationFailure> => {
        const state: PortalKernelState = await readSimulationState(transaction);
        const eventLog: ReadonlyArray<SimEvent> =
          (await transaction.get<ReadonlyArray<SimEvent>>(SIMULATION_EVENT_LOG_KEY)) ?? [];
        const tecTasks: Readonly<Record<string, SimTecTaskState>> =
          (await transaction.get<Readonly<Record<string, SimTecTaskState>>>(
            SIMULATION_TEC_TASKS_KEY,
          )) ?? {};

        if (
          state.events.some((queued: SimEvent): boolean => queued.id === event.id) ||
          eventLog.some((logged: SimEvent): boolean => logged.id === event.id)
        ) {
          return simulationFailure("DUPLICATE_EVENT", "Simulation event id already exists", 409);
        }
        if (state.events.length >= MAX_QUEUED_EVENTS) {
          return simulationFailure("EVENT_QUEUE_FULL", "Simulation event queue is full", 429);
        }

        const identityError: string | null = simulationIdentityError(
          state,
          tecTasks,
          event,
        );
        if (identityError !== null) {
          return simulationFailure("IDENTITY_MISMATCH", identityError, 403);
        }

        const nextEvents: ReadonlyArray<SimEvent> = [...state.events, event].sort(compareEvents);
        const nextState: PortalKernelState = { ...state, events: nextEvents };
        if (jsonSize(nextState) > MAX_SIMULATION_STATE_BYTES) {
          return simulationFailure(
            "EVENT_QUEUE_FULL",
            "Simulation state storage limit would be exceeded",
            429,
          );
        }
        await transaction.put(SIMULATION_STATE_KEY, nextState);
        return {
          ok: true,
          result: { event, queueDepth: nextEvents.length },
          sim: {
            entityId: eventEntityId(event),
            kind: eventKind(event.type),
            tickVersion: state.tick,
          },
          governance,
        };
      },
    );
  }

  private async tickSimulation(
    options: QuantumTickOptions = {},
  ): Promise<TickSuccess | SimulationFailure> {
    return this.state.storage.transaction(
      async (
        transaction: DurableObjectTransaction,
      ): Promise<TickSuccess | SimulationFailure> => {
        const current: PortalKernelState = await readSimulationState(transaction);
        const eventLog: ReadonlyArray<SimEvent> =
          (await transaction.get<ReadonlyArray<SimEvent>>(SIMULATION_EVENT_LOG_KEY)) ?? [];
        const diffLog: ReadonlyArray<SimTickDiff> =
          (await transaction.get<ReadonlyArray<SimTickDiff>>(SIMULATION_DIFF_LOG_KEY)) ?? [];
        let tecTasks: Readonly<Record<string, SimTecTaskState>> =
          (await transaction.get<Readonly<Record<string, SimTecTaskState>>>(
            SIMULATION_TEC_TASKS_KEY,
          )) ?? {};

        let next: PortalKernelState = {
          ...structuredClone(current),
          events: [],
          tick: current.tick + 1,
        };
        const orderedEvents: ReadonlyArray<SimEvent> = [...current.events].sort(compareEvents);
        const changes: SimDiffEntry[] = [];
        for (const event of orderedEvents) {
          const applied: AppliedEvent = applySimulationEvent(next, tecTasks, event);
          next = applied.state;
          tecTasks = applied.tecTasks;
          changes.push(applied.change);
        }

        const diff: SimTickDiff = deepFreeze({
          tick: next.tick,
          appliedEventIds: orderedEvents.map((event: SimEvent): string => event.id),
          changes,
        });
        if (jsonSize(next) > MAX_SIMULATION_STATE_BYTES || jsonSize(diff) > MAX_STORAGE_VALUE_BYTES) {
          return simulationFailure(
            "SIMULATION_STATE_LIMIT",
            "Simulation tick exceeds the durable storage limit",
            413,
          );
        }
        const nextEventLog: ReadonlyArray<SimEvent> = trimStoredEntries(
          [...eventLog, ...orderedEvents],
          MAX_EVENT_LOG_ENTRIES,
        );
        const nextDiffLog: ReadonlyArray<SimTickDiff> = trimStoredEntries(
          [...diffLog, diff],
          MAX_DIFF_LOG_ENTRIES,
        );
        let quantum: QuantumOverlay;
        try {
          const classical = {
            ...next,
            eventLog: nextEventLog,
            diffLog: nextDiffLog,
            tecTasks,
          };
          const inference = runInference({ simulation: classical });
          quantum = generateQuantumOverlay({
            classical,
            seed: options.seed ?? `tick:${next.tick}`,
            collapsePolicy: options.collapsePolicy,
            governanceContext: options.governanceContext,
            governanceMode: resolveMode(this.env.UMBRELLA_ENFORCEMENT),
            inference,
          });
        } catch (error) {
          return simulationFailure(
            "QUANTUM_COLLAPSE_DENIED",
            error instanceof Error ? error.message : "Quantum collapse failed",
            403,
          );
        }
        if (jsonSize(quantum) > MAX_STORAGE_VALUE_BYTES) {
          return simulationFailure(
            "SIMULATION_STATE_LIMIT",
            "Quantum overlay exceeds the durable storage limit",
            413,
          );
        }

        await transaction.put(SIMULATION_STATE_KEY, next);
        await transaction.put(SIMULATION_EVENT_LOG_KEY, nextEventLog);
        await transaction.put(SIMULATION_DIFF_LOG_KEY, nextDiffLog);
        await transaction.put(SIMULATION_TEC_TASKS_KEY, tecTasks);
        await transaction.put(QUANTUM_STATE_KEY, quantum);

        return {
          result: { tick: next.tick, diff, snapshot: next, quantum },
          sim: {
            entityId: "simulation",
            kind: "simulation",
            tickVersion: next.tick,
          },
        };
      },
    );
  }

  private async readSimulationSnapshot(): Promise<SimulationSnapshot> {
    const [storedState, eventLog, diffLog, tecTasks, storedQuantum] = await Promise.all([
      this.state.storage.get<PortalKernelState>(SIMULATION_STATE_KEY),
      this.state.storage.get<ReadonlyArray<SimEvent>>(SIMULATION_EVENT_LOG_KEY),
      this.state.storage.get<ReadonlyArray<SimTickDiff>>(SIMULATION_DIFF_LOG_KEY),
      this.state.storage.get<Readonly<Record<string, SimTecTaskState>>>(
        SIMULATION_TEC_TASKS_KEY,
      ),
      this.state.storage.get<QuantumOverlay>(QUANTUM_STATE_KEY),
    ]);
    const state: PortalKernelState = storedState ?? initialSimulationState();
    const base = {
      ...state,
      eventLog: eventLog ?? [],
      diffLog: diffLog ?? [],
      tecTasks: tecTasks ?? {},
    };
    const quantum: QuantumOverlay = storedQuantum ?? generateQuantumOverlay({
      classical: base,
      seed: `tick:${state.tick}`,
      inference: runInference({ simulation: base }),
    });
    return { ...base, quantum };
  }

  private async readUniverse(): Promise<UniverseState> {
    return (await this.state.storage.get<UniverseState>(UNIVERSE_STATE_KEY)) ?? initialUniverse();
  }

  private async readInstituteState(): Promise<InstituteState> {
    return (await this.state.storage.get<InstituteState>(INSTITUTE_STATE_KEY)) ?? initialInstituteState();
  }

  private async readPlanetaryState(): Promise<PlanetaryState> {
    return (await this.state.storage.get<PlanetaryState>(PLANETARY_STATE_KEY)) ?? initialPlanetaryState();
  }

  private async tickUniverse(envelope: KernelEnvelope): Promise<UniverseState> {
    return this.state.storage.transaction(
      async (transaction: DurableObjectTransaction): Promise<UniverseState> => {
        const current: UniverseState =
          (await transaction.get<UniverseState>(UNIVERSE_STATE_KEY)) ?? initialUniverse();
        const changes: Readonly<Record<string, unknown>> = isRecord(envelope.payload.changes)
          ? envelope.payload.changes
          : {};
        const nextProperties: Record<string, unknown> = { ...current.properties };
        for (const key of Object.keys(changes).sort()) {
          const value: unknown = changes[key];
          if (typeof value === "number") {
            const existing: number =
              typeof nextProperties[key] === "number" ? Number(nextProperties[key]) : 0;
            nextProperties[key] = existing + value;
          } else {
            nextProperties[key] = value;
          }
        }
        const next: UniverseState = {
          tick: current.tick + 1,
          properties: nextProperties,
          lastOperation: { messageId: envelope.id, type: envelope.type },
        };
        await transaction.put(UNIVERSE_STATE_KEY, next);
        return next;
      },
    );
  }

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
