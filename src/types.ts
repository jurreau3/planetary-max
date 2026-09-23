export type UmbrellaMode = "strict" | "advisory" | "off";

export type GovernanceDecision = "allowed" | "denied" | "advisory" | "bypassed";

export type GovernanceContext = Readonly<Record<string, unknown>>;

export type KernelEnvelope = Readonly<{
  id: string;
  type: string;
  payload: Readonly<Record<string, unknown>>;
  identity: string;
  governanceContext: GovernanceContext;
}>;

export type GovernanceMetadata = Readonly<{
  mode: UmbrellaMode;
  decision: GovernanceDecision;
  rationale?: string;
  deltas: ReadonlyArray<Readonly<Record<string, unknown>>>;
}>;

export type KernelLane = Readonly<{
  name: string;
  result: Readonly<{
    results: ReadonlyArray<Readonly<{
      result: Readonly<{
        data: Readonly<Record<string, unknown>>;
        meta: Readonly<{ source: string; governance: UmbrellaMode }>;
      }>;
    }>>;
  }>;
}>;

export type KernelResult = Readonly<{
  ok: boolean;
  result?: unknown;
  error?: Readonly<{ code: string; message: string }>;
  meta?: Readonly<Record<string, unknown>>;
}>;

export interface FetcherBinding {
  fetch(request: Request): Promise<Response>;
}

export interface KernelNamespaceBinding {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): FetcherBinding;
}

export type Bindings = Readonly<{
  PORTAL_KERNEL: KernelNamespaceBinding;
  MAX_OS_1: FetcherBinding;
  IDENTITY_JWT_SECRET: string;
  IDENTITY_JWT_ISSUER: string;
  IDENTITY_JWT_AUDIENCE: string;
  PLANETARY_MODE: string;
  UMBRELLA_ENFORCEMENT: string;
}>;

export type IdentityEnvironment = Pick<
  Bindings,
  "IDENTITY_JWT_SECRET" | "IDENTITY_JWT_ISSUER" | "IDENTITY_JWT_AUDIENCE"
>;

export type KernelEnvironment = Pick<Bindings, "UMBRELLA_ENFORCEMENT">;

export type SimIdentity = Readonly<{
  id: string;
  kind: "agent" | "window" | "substrate";
  ref: string;
}>;

export type SimEventType =
  | "agent.move"
  | "agent.goal.update"
  | "window.focus"
  | "window.layout.change"
  | "substrate.shift"
  | "substrate.anomaly"
  | "tec.task.created"
  | "tec.task.completed";

export type SimEvent = Readonly<{
  id: string;
  type: SimEventType;
  payload: Readonly<Record<string, unknown>>;
  at: number;
  identityId?: string;
}>;

export type SimAgentState = Readonly<{
  id: string;
  identityId: string;
  traits: Readonly<Record<string, unknown>>;
  mood: string;
  goals: Readonly<Record<string, unknown>>;
  location: Readonly<{ x: number; y: number }>;
  tickVersion: number;
}>;

export type SimWindowState = Readonly<{
  id: string;
  ownerIdentityId: string;
  focus: boolean;
  layout: Readonly<Record<string, unknown>>;
  openSince: number;
  history: ReadonlyArray<SimEvent>;
}>;

export type SimSubstrateState = Readonly<{
  id: string;
  resources: Readonly<Record<string, number>>;
  topology: Readonly<Record<string, unknown>>;
  stability: number;
  anomalies: ReadonlyArray<SimEvent>;
}>;

export type PortalKernelState = Readonly<{
  agents: Readonly<Record<string, SimAgentState>>;
  windows: Readonly<Record<string, SimWindowState>>;
  substrate: SimSubstrateState;
  events: ReadonlyArray<SimEvent>;
  tick: number;
}>;

export type SimDiffEntry = Readonly<{
  eventId: string;
  kind: "agent" | "window" | "substrate" | "tec";
  entityId: string;
  before: unknown;
  after: unknown;
}>;

export type SimTickDiff = Readonly<{
  tick: number;
  appliedEventIds: ReadonlyArray<string>;
  changes: ReadonlyArray<SimDiffEntry>;
}>;

export type SimTecTaskState = Readonly<{
  id: string;
  identityId: string;
  status: "created" | "completed";
  tickVersion: number;
}>;

export type InstituteTruth = Readonly<{
  id: string;
  description: string;
  sourceFacts: ReadonlyArray<string>;
  stability: number;
  curvature: number;
  createdAt: number;
  updatedAt: number;
}>;

export type InstituteCanon = Readonly<{
  truths: Readonly<Record<string, InstituteTruth>>;
  version: number;
  updatedAt: number;
}>;

export type EpistemicEventAction = "added" | "updated" | "deprecated";

export type EpistemicEvent = Readonly<{
  id: string;
  truthId: string;
  action: EpistemicEventAction;
  at: number;
  meta: Readonly<Record<string, unknown>>;
}>;

export type EpistemicTimeline = Readonly<{
  identityId: string;
  events: ReadonlyArray<EpistemicEvent>;
}>;

export type InstituteState = Readonly<{
  canon: InstituteCanon;
  timelines: Readonly<Record<string, EpistemicTimeline>>;
}>;

export type InstituteInferenceFact = Readonly<{
  id: string;
  description: string;
  confidence: number;
}>;

export type InstituteQuantumBranch = Readonly<{
  factId: string;
  probability: number;
  curvature: number;
}>;

export type InstituteSimulationDelta = Readonly<{
  factId: string;
  tick: number;
}>;

export type InstituteTruthFormation = Readonly<{
  id: string;
  description: string;
  identityId: string;
  facts: ReadonlyArray<InstituteInferenceFact>;
  quantumBranches: ReadonlyArray<InstituteQuantumBranch>;
  simulationDeltas: ReadonlyArray<InstituteSimulationDelta>;
  at: number;
}>;
