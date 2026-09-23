import type {
  EpistemicTimeline,
  GovernanceMetadata,
  InstituteState,
  KernelEnvelope,
  KernelEnvironment,
  KernelLane,
  PortalKernelState,
  SimAgentState,
  SimDiffEntry,
  SimEvent,
  SimEventType,
  SimSubstrateState,
  SimTecTaskState,
  SimTickDiff,
  SimWindowState,
  UmbrellaMode,
} from "./types";
import {
  formInstituteTruth,
  initialInstituteState,
  isInstituteFormationFailure,
  parseTruthFormation,
  type InstituteFormationFailure,
  type InstituteFormationResult,
} from "./institute";

type UniverseState = Readonly<{
  tick: number;
  properties: Readonly<Record<string, unknown>>;
  lastOperation: Readonly<{ messageId: string; type: string }> | null;
}>;

type SimulationAuxiliaryState = Readonly<{
  eventLog: ReadonlyArray<SimEvent>;
  diffLog: ReadonlyArray<SimTickDiff>;
  tecTasks: Readonly<Record<string, SimTecTaskState>>;
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
  }>;
  sim: SimulationMeta;
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
        ? this.simulationTickResponse()
        : failureResponse("METHOD_NOT_ALLOWED", "Simulation ticks require POST", 405);
    }
    if (url.pathname === "/kernel/institute/state") {
      return request.method === "GET"
        ? this.instituteStateResponse()
        : failureResponse("METHOD_NOT_ALLOWED", "Institute state requires GET", 405);
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
      const tick: TickSuccess | SimulationFailure = await this.tickSimulation();
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
      return this.formInstituteTruth(envelope);
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

  private async simulationTickResponse(): Promise<Response> {
    const tick: TickSuccess | SimulationFailure = await this.tickSimulation();
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

  private async formInstituteTruth(envelope: KernelEnvelope): Promise<DispatchOutput | Response> {
    const formation = parseTruthFormation(envelope.payload, envelope.identity);
    if ("code" in formation) {
      return failureResponse(formation.code, formation.message, 400);
    }
    return this.state.storage.transaction(
      async (transaction: DurableObjectTransaction): Promise<DispatchOutput | Response> => {
        const current: InstituteState =
          (await transaction.get<InstituteState>(INSTITUTE_STATE_KEY)) ?? initialInstituteState();
        const result: InstituteFormationResult | InstituteFormationFailure = formInstituteTruth(
          current,
          formation,
        );
        if (isInstituteFormationFailure(result)) {
          const status: number = result.code === "UNSTABLE_INSTITUTE_PATTERN" ? 422 : 400;
          return failureResponse(result.code, result.message, status);
        }
        await transaction.put(INSTITUTE_STATE_KEY, result.state);
        return {
          data: {
            truth: result.truth,
            epistemicEvent: result.event,
            canonVersion: result.state.canon.version,
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

  private async tickSimulation(): Promise<TickSuccess | SimulationFailure> {
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

        await transaction.put(SIMULATION_STATE_KEY, next);
        await transaction.put(SIMULATION_EVENT_LOG_KEY, nextEventLog);
        await transaction.put(SIMULATION_DIFF_LOG_KEY, nextDiffLog);
        await transaction.put(SIMULATION_TEC_TASKS_KEY, tecTasks);

        return {
          result: { tick: next.tick, diff, snapshot: next },
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
    const [state, eventLog, diffLog, tecTasks] = await Promise.all([
      this.state.storage.get<PortalKernelState>(SIMULATION_STATE_KEY),
      this.state.storage.get<ReadonlyArray<SimEvent>>(SIMULATION_EVENT_LOG_KEY),
      this.state.storage.get<ReadonlyArray<SimTickDiff>>(SIMULATION_DIFF_LOG_KEY),
      this.state.storage.get<Readonly<Record<string, SimTecTaskState>>>(
        SIMULATION_TEC_TASKS_KEY,
      ),
    ]);
    return {
      ...(state ?? initialSimulationState()),
      eventLog: eventLog ?? [],
      diffLog: diffLog ?? [],
      tecTasks: tecTasks ?? {},
    };
  }

  private async readUniverse(): Promise<UniverseState> {
    return (await this.state.storage.get<UniverseState>(UNIVERSE_STATE_KEY)) ?? initialUniverse();
  }

  private async readInstituteState(): Promise<InstituteState> {
    return (await this.state.storage.get<InstituteState>(INSTITUTE_STATE_KEY)) ?? initialInstituteState();
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

  private introspectionSnapshot(
    envelope: KernelEnvelope,
    governance: GovernanceMetadata,
  ): Readonly<Record<string, unknown>> {
    return {
      kind: envelope.type.slice(INTROSPECTION_PREFIX.length),
      mode: governance.mode,
      allowed: governance.decision !== "denied",
      messageId: envelope.id,
      scope: "portal-kernel",
      identity: envelope.identity,
    };
  }
}

function initialUniverse(): UniverseState {
  return { tick: 0, properties: {}, lastOperation: null };
}

function initialSimulationState(): PortalKernelState {
  return {
    agents: {},
    windows: {},
    substrate: {
      id: "substrate",
      resources: {},
      topology: {},
      stability: 100,
      anomalies: [],
    },
    events: [],
    tick: 0,
  };
}

async function readSimulationState(
  storage: Pick<DurableObjectStorage, "get">,
): Promise<PortalKernelState> {
  return (await storage.get<PortalKernelState>(SIMULATION_STATE_KEY)) ?? initialSimulationState();
}

async function readJsonObject(
  request: Request,
  message: string,
): Promise<Record<string, unknown> | Response> {
  try {
    const value: unknown = await request.json();
    return isRecord(value) ? value : failureResponse("INVALID_JSON", message, 400);
  } catch {
    return failureResponse("INVALID_JSON", message, 400);
  }
}

function validateEnvelope(value: Record<string, unknown>): KernelEnvelope | Response {
  if (
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.type !== "string" ||
    !value.type.trim() ||
    !isRecord(value.payload) ||
    typeof value.identity !== "string" ||
    !value.identity.trim() ||
    !isRecord(value.governanceContext)
  ) {
    return failureResponse("INVALID_MESSAGE", "Kernel envelope is incomplete", 400);
  }
  return value as KernelEnvelope;
}

function validateSimulationEvent(
  value: unknown,
  expectedIdentity?: string,
): SimEvent | SimulationFailure {
  if (!isRecord(value)) {
    return simulationFailure("INVALID_MESSAGE", "Simulation event must be an object", 400);
  }
  if (typeof value.id !== "string" || !value.id.trim()) {
    return simulationFailure("INVALID_MESSAGE", "Simulation event id is required", 400);
  }
  if (typeof value.type !== "string" || !SIM_EVENT_TYPES.has(value.type)) {
    return simulationFailure("INVALID_MESSAGE", "Simulation event type is unsupported", 400);
  }
  if (!isRecord(value.payload) || !hasSafeKeys(value.payload)) {
    return simulationFailure("INVALID_MESSAGE", "Simulation event payload is invalid", 400);
  }
  if (jsonSize(value.payload) > MAX_EVENT_PAYLOAD_BYTES) {
    return simulationFailure("INVALID_MESSAGE", "Simulation event payload is too large", 400);
  }
  if (typeof value.at !== "number" || !Number.isSafeInteger(value.at) || value.at < 0) {
    return simulationFailure("INVALID_MESSAGE", "Simulation event at must be a non-negative integer", 400);
  }

  const type: SimEventType = value.type as SimEventType;
  const providedIdentity: string | undefined =
    typeof value.identityId === "string" && value.identityId.trim()
      ? value.identityId
      : undefined;
  if (expectedIdentity !== undefined && providedIdentity !== undefined && providedIdentity !== expectedIdentity) {
    return simulationFailure(
      "IDENTITY_MISMATCH",
      "Simulation event identity does not match the verified identity",
      403,
    );
  }
  const identityId: string | undefined = providedIdentity ?? expectedIdentity;
  if (eventRequiresIdentity(type) && identityId === undefined) {
    return simulationFailure(
      "INVALID_MESSAGE",
      "Simulation event identityId is required",
      400,
    );
  }

  const payloadError: string | null = validateEventPayload(type, value.payload);
  if (payloadError !== null) {
    return simulationFailure("INVALID_MESSAGE", payloadError, 400);
  }

  return deepFreeze({
    id: value.id,
    type,
    payload: structuredClone(value.payload),
    at: value.at,
    ...(identityId === undefined ? {} : { identityId }),
  });
}

function validateEventPayload(
  type: SimEventType,
  payload: Readonly<Record<string, unknown>>,
): string | null {
  if (type.startsWith("agent.") && !nonEmptyString(payload.agentId)) {
    return "Agent event payload requires agentId";
  }
  if (type === "agent.move" && (!finiteNumber(payload.dx) || !finiteNumber(payload.dy))) {
    return "agent.move requires finite dx and dy";
  }
  if (type === "agent.goal.update" && !isRecord(payload.goals)) {
    return "agent.goal.update requires goals";
  }
  if (type.startsWith("window.") && !nonEmptyString(payload.windowId)) {
    return "Window event payload requires windowId";
  }
  if (type === "window.focus" && typeof payload.focus !== "boolean") {
    return "window.focus requires a boolean focus";
  }
  if (type === "window.layout.change" && !isRecord(payload.layout)) {
    return "window.layout.change requires layout";
  }
  if (
    type === "substrate.shift" &&
    (!finiteNumber(payload.magnitude) || Number(payload.magnitude) < 0)
  ) {
    return "substrate.shift requires a non-negative magnitude";
  }
  if (type.startsWith("tec.") && !nonEmptyString(payload.taskId)) {
    return "TEC event payload requires taskId";
  }
  return null;
}

function evaluateEventGovernance(
  event: SimEvent,
  context: Readonly<Record<string, unknown>>,
  configuredMode: string | undefined,
): Readonly<Record<string, unknown>> {
  const mode: UmbrellaMode = resolveMode(configuredMode);
  if (mode === "off") {
    return { mode, decision: "allowed", rationale: "Umbrella governance is disabled", eventId: event.id };
  }

  const reasons: string[] = [];
  if (context.deny === true || context.decision === "denied") reasons.push("explicit deny");
  if (Array.isArray(context.deniedEventTypes) && context.deniedEventTypes.includes(event.type)) {
    reasons.push("event type is denied");
  }
  if (
    Array.isArray(context.allowedIdentities) &&
    event.identityId !== undefined &&
    !context.allowedIdentities.includes(event.identityId)
  ) {
    reasons.push("identity is not allowed");
  }
  if (
    event.type.startsWith("agent.") &&
    Array.isArray(context.throttledIdentityIds) &&
    event.identityId !== undefined &&
    context.throttledIdentityIds.includes(event.identityId)
  ) {
    reasons.push("agent identity is throttled");
  }
  if (
    event.type.startsWith("window.") &&
    Array.isArray(context.allowedWindowOperations) &&
    !context.allowedWindowOperations.includes(event.type)
  ) {
    reasons.push("window operation is restricted");
  }
  if (
    event.type === "substrate.shift" &&
    typeof context.maxSubstrateShift === "number" &&
    Number(event.payload.magnitude) > context.maxSubstrateShift
  ) {
    reasons.push("substrate shift exceeds policy limit");
  }

  const denied: boolean = mode === "strict" && reasons.length > 0;
  return {
    mode,
    decision: denied ? "denied" : mode === "advisory" ? "advisory" : "allowed",
    rationale:
      reasons.length > 0
        ? reasons.join("; ")
        : mode === "advisory"
          ? "Umbrella evaluated the event in advisory mode"
          : "Umbrella allows the event",
    eventId: event.id,
    warnings: reasons,
  };
}

function simulationIdentityError(
  state: PortalKernelState,
  tecTasks: Readonly<Record<string, SimTecTaskState>>,
  event: SimEvent,
): string | null {
  const entityId: string = eventEntityId(event);
  if (event.type.startsWith("agent.")) {
    const identity: string | undefined = state.agents[entityId]?.identityId ??
      pendingEntityIdentity(state.events, event.type, entityId);
    return identity !== undefined && identity !== event.identityId
      ? "Agent event identity does not match the bound agent identity"
      : null;
  }
  if (event.type.startsWith("window.")) {
    const identity: string | undefined = state.windows[entityId]?.ownerIdentityId ??
      pendingEntityIdentity(state.events, event.type, entityId);
    return identity !== undefined && identity !== event.identityId
      ? "Window event identity does not match the bound owner identity"
      : null;
  }
  if (event.type.startsWith("tec.")) {
    const identity: string | undefined = tecTasks[entityId]?.identityId ??
      pendingEntityIdentity(state.events, event.type, entityId);
    return identity !== undefined && identity !== event.identityId
      ? "TEC event identity does not match the bound task identity"
      : null;
  }
  return null;
}

function pendingEntityIdentity(
  events: ReadonlyArray<SimEvent>,
  type: SimEventType,
  entityId: string,
): string | undefined {
  const prefix: string = type.split(".")[0] ?? "";
  return events.find(
    (event: SimEvent): boolean =>
      event.type.startsWith(`${prefix}.`) && eventEntityId(event) === entityId,
  )?.identityId;
}

function applySimulationEvent(
  state: PortalKernelState,
  tecTasks: Readonly<Record<string, SimTecTaskState>>,
  event: SimEvent,
): AppliedEvent {
  const kind: SimDiffEntry["kind"] = eventKind(event.type);
  const entityId: string = eventEntityId(event);

  if (kind === "agent") {
    const before: SimAgentState | null = state.agents[entityId] ?? null;
    const base: SimAgentState = before ?? initialAgent(event);
    const after: SimAgentState = event.type === "agent.move"
      ? {
          ...base,
          location: {
            x: base.location.x + Number(event.payload.dx),
            y: base.location.y + Number(event.payload.dy),
          },
          tickVersion: base.tickVersion + 1,
        }
      : {
          ...base,
          goals: {
            ...base.goals,
            ...(event.payload.goals as Readonly<Record<string, unknown>>),
          },
          tickVersion: base.tickVersion + 1,
        };
    return {
      state: { ...state, agents: { ...state.agents, [entityId]: after } },
      tecTasks,
      change: { eventId: event.id, kind, entityId, before, after },
    };
  }

  if (kind === "window") {
    const before: SimWindowState | null = state.windows[entityId] ?? null;
    const base: SimWindowState = before ?? initialWindow(event);
    const after: SimWindowState = event.type === "window.focus"
      ? {
          ...base,
          focus: Boolean(event.payload.focus),
          history: [...base.history, event].slice(-MAX_ENTITY_HISTORY_ENTRIES),
        }
      : {
          ...base,
          layout: structuredClone(event.payload.layout as Readonly<Record<string, unknown>>),
          history: [...base.history, event].slice(-MAX_ENTITY_HISTORY_ENTRIES),
        };
    return {
      state: { ...state, windows: { ...state.windows, [entityId]: after } },
      tecTasks,
      change: { eventId: event.id, kind, entityId, before, after },
    };
  }

  if (kind === "substrate") {
    const before: SimSubstrateState = state.substrate;
    const after: SimSubstrateState = event.type === "substrate.shift"
      ? applySubstrateShift(before, event)
      : {
          ...before,
          anomalies: [...before.anomalies, event].slice(-MAX_ENTITY_HISTORY_ENTRIES),
        };
    return {
      state: { ...state, substrate: after },
      tecTasks,
      change: { eventId: event.id, kind, entityId, before, after },
    };
  }

  const before: SimTecTaskState | null = tecTasks[entityId] ?? null;
  const after: SimTecTaskState = {
    id: entityId,
    identityId: requiredIdentity(event),
    status: event.type === "tec.task.completed" ? "completed" : "created",
    tickVersion: (before?.tickVersion ?? 0) + 1,
  };
  return {
    state,
    tecTasks: { ...tecTasks, [entityId]: after },
    change: { eventId: event.id, kind, entityId, before, after },
  };
}

function initialAgent(event: SimEvent): SimAgentState {
  const initialLocation: Readonly<Record<string, unknown>> = isRecord(event.payload.location)
    ? event.payload.location
    : {};
  return {
    id: eventEntityId(event),
    identityId: requiredIdentity(event),
    traits: isRecord(event.payload.traits) ? structuredClone(event.payload.traits) : {},
    mood: typeof event.payload.mood === "string" ? event.payload.mood : "neutral",
    goals: isRecord(event.payload.goals) ? structuredClone(event.payload.goals) : {},
    location: {
      x: finiteNumber(initialLocation.x) ? Number(initialLocation.x) : 0,
      y: finiteNumber(initialLocation.y) ? Number(initialLocation.y) : 0,
    },
    tickVersion: 0,
  };
}

function initialWindow(event: SimEvent): SimWindowState {
  return {
    id: eventEntityId(event),
    ownerIdentityId: requiredIdentity(event),
    focus: false,
    layout: {},
    openSince: event.at,
    history: [],
  };
}

function applySubstrateShift(
  substrate: SimSubstrateState,
  event: SimEvent,
): SimSubstrateState {
  const resourceDeltas: Readonly<Record<string, unknown>> = isRecord(event.payload.resources)
    ? event.payload.resources
    : {};
  const resources: Record<string, number> = { ...substrate.resources };
  for (const key of Object.keys(resourceDeltas).sort()) {
    const delta: unknown = resourceDeltas[key];
    if (finiteNumber(delta)) resources[key] = (resources[key] ?? 0) + Number(delta);
  }
  return {
    ...substrate,
    resources,
    topology: isRecord(event.payload.topology)
      ? structuredClone(event.payload.topology)
      : substrate.topology,
    stability: Math.max(0, substrate.stability - Number(event.payload.magnitude)),
    anomalies: [...substrate.anomalies, event].slice(-MAX_ENTITY_HISTORY_ENTRIES),
  };
}

function eventKind(type: SimEventType): SimDiffEntry["kind"] {
  if (type.startsWith("agent.")) return "agent";
  if (type.startsWith("window.")) return "window";
  if (type.startsWith("substrate.")) return "substrate";
  return "tec";
}

function eventEntityId(event: SimEvent): string {
  if (event.type.startsWith("agent.")) return String(event.payload.agentId);
  if (event.type.startsWith("window.")) return String(event.payload.windowId);
  if (event.type.startsWith("tec.")) return String(event.payload.taskId);
  return "substrate";
}

function eventRequiresIdentity(type: SimEventType): boolean {
  return !type.startsWith("substrate.");
}

function requiredIdentity(event: SimEvent): string {
  if (event.identityId === undefined) throw new Error("Identity-bound event is missing identityId");
  return event.identityId;
}

function compareEvents(left: SimEvent, right: SimEvent): number {
  return left.at - right.at || compareOrdinal(left.id, right.id);
}

function simulationKindForMessage(type: string): SimulationMeta["kind"] {
  if (type.startsWith("sim.agent.")) return "agent";
  if (type.startsWith("sim.window.")) return "window";
  if (type.startsWith("sim.substrate.")) return "substrate";
  if (type.startsWith("sim.tec.")) return "tec";
  return "simulation";
}

function commandAcceptsEvent(commandType: string, eventType: unknown): boolean {
  if (typeof eventType !== "string") return false;
  if (commandType === "sim.agent.command") return eventType.startsWith("agent.");
  if (commandType === "sim.window.command") return eventType.startsWith("window.");
  if (commandType === "sim.substrate.event") return eventType.startsWith("substrate.");
  return false;
}

function selectSimulationEntity(
  state: PortalKernelState,
  kind: SimulationMeta["kind"],
  entityId: string,
): unknown {
  if (kind === "agent") return state.agents[entityId] ?? null;
  if (kind === "window") return state.windows[entityId] ?? null;
  if (kind === "substrate") return state.substrate;
  return null;
}

function simulationTickVersion(
  entity: unknown,
  diff: SimTickDiff,
  kind: SimulationMeta["kind"],
  fallback: number,
): number {
  if (isRecord(entity) && finiteNumber(entity.tickVersion)) return entity.tickVersion;
  if (kind === "tec") {
    const lastTecChange: SimDiffEntry | undefined = [...diff.changes]
      .reverse()
      .find((change: SimDiffEntry): boolean => change.kind === "tec");
    if (isRecord(lastTecChange?.after) && finiteNumber(lastTecChange.after.tickVersion)) {
      return lastTecChange.after.tickVersion;
    }
  }
  return fallback;
}

function evaluateGovernance(
  envelope: KernelEnvelope,
  configuredMode: string | undefined,
): GovernanceMetadata {
  const mode: UmbrellaMode = resolveMode(configuredMode);
  if (mode === "off") return { mode, decision: "bypassed", deltas: [] };

  const lane: string = laneForType(envelope.type);
  const operation: string =
    envelope.type === "umbrella.os" && typeof envelope.payload.operation === "string"
      ? envelope.payload.operation
      : envelope.type;
  const context: Readonly<Record<string, unknown>> = envelope.governanceContext;
  const deltas: Array<Readonly<Record<string, unknown>>> = [];
  if (context.decision === "denied" || context.deny === true) {
    deltas.push({ rule: "explicit-deny", lane });
  }
  if (Array.isArray(context.allowedLanes) && !context.allowedLanes.includes(lane)) {
    deltas.push({ rule: "lane-access", lane });
  }
  if (isRecord(context.permissions) && context.permissions[operation] === false) {
    deltas.push({ rule: "agent-permission", operation });
  }
  if (envelope.payload.structuralTruth === false) {
    deltas.push({ rule: "structural-truth", invariant: "structuralTruth" });
  }
  if (Array.isArray(context.allowedIdentities) && !context.allowedIdentities.includes(envelope.identity)) {
    deltas.push({ rule: "identity-physics", identityAccepted: false });
  }
  const denied: boolean = deltas.length > 0 && mode === "strict";
  return {
    mode,
    decision: denied ? "denied" : mode === "advisory" ? "advisory" : "allowed",
    ...(deltas.length > 0
      ? { rationale: denied ? "Umbrella policy denied the operation" : "Umbrella policy recorded advisory findings" }
      : {}),
    deltas,
  };
}

function laneForType(type: string): string {
  if (type.startsWith(INTROSPECTION_PREFIX)) return "introspection";
  if (SIM_TICK_MESSAGE_TYPES.has(type) || SIM_COMMAND_MESSAGE_TYPES.has(type)) return "simulation";
  if (type === "identity.physics.license") return "umbrella.identity-physics";
  if (type === "umbrella.os" || type.startsWith("os.")) return "umbrella.os";
  if (type.startsWith("umbrella.") || type.includes("license")) return "umbrella";
  if (type.startsWith("universe.")) return "universe";
  if (type.startsWith("institute.")) return "institute";
  return "kernel";
}

function makeLane(
  name: string,
  data: Readonly<Record<string, unknown>>,
  source: string,
  governance: UmbrellaMode,
): KernelLane {
  return {
    name,
    result: { results: [{ result: { data, meta: { source, governance } } }] },
  };
}

function umbrellaUpdateName(type: string): string {
  if (type === "umbrella.os" || type.startsWith("os.")) return "os-update";
  if (type.startsWith("umbrella.") || type.includes("license")) return "sim-update";
  if (type.startsWith("sim.")) return "simulation";
  if (type.startsWith("institute.")) return "institute";
  return "kernel";
}

function resolveMode(value: string | undefined): UmbrellaMode {
  return value === "strict" || value === "advisory" || value === "off" ? value : "strict";
}

function simulationFailure(
  code: string,
  message: string,
  status: number,
  meta?: Readonly<Record<string, unknown>>,
): SimulationFailure {
  return { ok: false, status, code, message, ...(meta === undefined ? {} : { meta }) };
}

function simulationFailureResponse(failure: SimulationFailure): Response {
  return Response.json(
    {
      ok: false,
      error: { code: failure.code, message: failure.message },
      ...(failure.meta === undefined ? {} : { meta: failure.meta }),
    },
    { status: failure.status },
  );
}

function isSimulationFailure(value: unknown): value is SimulationFailure {
  return (
    isRecord(value) &&
    value.ok === false &&
    typeof value.status === "number" &&
    typeof value.code === "string" &&
    typeof value.message === "string"
  );
}

function failureResponse(code: string, message: string, status: number): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

function hasSafeKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.every((entry: unknown): boolean => hasSafeKeys(entry));
  if (!isRecord(value)) return true;
  for (const [key, nested] of Object.entries(value)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") return false;
    if (!hasSafeKeys(nested)) return false;
  }
  return true;
}

function jsonSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function trimStoredEntries<T>(
  values: ReadonlyArray<T>,
  maximumEntries: number,
): ReadonlyArray<T> {
  const retained: T[] = [];
  for (let index: number = values.length - 1; index >= 0; index -= 1) {
    const value: T | undefined = values[index];
    if (value === undefined || retained.length >= maximumEntries) break;
    const candidate: T[] = [value, ...retained];
    if (jsonSize(candidate) > MAX_STORAGE_VALUE_BYTES) break;
    retained.unshift(value);
  }
  return retained;
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
