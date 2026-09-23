//
// MAX‑Institute Unified Type Surface
// Portal‑OS Wing
// Planetary‑MAX Quantum Substrate
//

// -------------------------------------------------------------
// Core Kernel Types
// -------------------------------------------------------------

export type Bindings = Record<string, unknown>;

export type KernelLane = "sim" | "identity" | "windows" | "tec" | "umbrella";

export type KernelEnvelope = {
  lane: KernelLane;
  payload: unknown;
  identity?: string | null;
  governance?: GovernanceMetadata | null;
};

export type KernelResult = {
  ok: boolean;
  status: number;
  body: unknown;
  governance?: GovernanceMetadata | null;
};

export type PortalKernelState = {
  sim: SimSubstrateState;
  windows: Record<string, SimWindowState>;
  identity: Record<string, SimAgentState>;
  tec: Record<string, SimTecTaskState>;
  substrate: SimSubstrateState;
};

// -------------------------------------------------------------
// Governance Types
// -------------------------------------------------------------

export type UmbrellaMode = "strict" | "advisory" | "off";

export type GovernanceMetadata = {
  mode: UmbrellaMode;
  decision: "allow" | "deny" | "advise";
  reason?: string;
};

export type GovernanceInference = {
  confidence: number;
  advisory?: string;
};

// -------------------------------------------------------------
// Simulation Types
// -------------------------------------------------------------

export type SimEventType =
  | "agent.move"
  | "agent.identity"
  | "window.focus"
  | "window.state"
  | "tec.task"
  | "substrate.adjust";

export type SimEvent = {
  id: string;
  type: SimEventType;
  identityId?: string;
  windowId?: string;
  payload?: unknown;
};

export type SimAgentState = {
  id: string;
  position?: { x: number; y: number };
  identity?: string;
};

export type SimWindowState = {
  id: string;
  focusHistory: string[];
  state: Record<string, unknown>;
};

export type SimTecTaskState = {
  id: string;
  kind: string;
  progress: number;
};

export type SimSubstrateState = {
  stability: number;
};

export type SimTickDiff = {
  deltas: Record<string, unknown>;
  events: SimEvent[];
};

// -------------------------------------------------------------
// Quantum Types
// -------------------------------------------------------------

export type QuantumBranch = {
  id: string;
  probability: number;
  stateDelta: Readonly<Record<string, unknown>>;
  signature: string;
};

export type QuantumCollapsePolicy =
  | "deterministic"
  | "probabilistic"
  | "governed";

export type QuantumOverlay = {
  branches: Readonly<QuantumBranch[]>;
  curvature: number;
  signature: string;
  collapsePolicy: QuantumCollapsePolicy;
};

export type QuantumGovernanceContext = {
  mode: UmbrellaMode;
  identity?: string;
};

export type QuantumSignature = string;

export type QuantumState = {
  overlay: QuantumOverlay | null;
};

// -------------------------------------------------------------
// Planetary Types
// -------------------------------------------------------------

export type PlanetaryIdentity = {
  id: string;
  signature: string;
};

export type PlanetaryNodeSnapshot = {
  id: string;
  identity: PlanetaryIdentity;
  quantum: PlanetaryQuantumState;
  substrate: PlanetarySubstrate;
  canon: PlanetaryCanon;
};

export type PlanetaryQuantumState = {
  overlay: QuantumOverlay | null;
};

export type PlanetarySubstrate = {
  stability: number;
};

export type PlanetaryCanon = {
  truths: InstituteTruth[];
  signature: string;
};

export type PlanetaryGovernanceContext = {
  mode: UmbrellaMode;
  reason?: string;
};

export type PlanetaryState = {
  nodes: PlanetaryNodeSnapshot[];
};

export type PlanetarySynchronization = {
  branches: QuantumBranch[];
  explicitSync: boolean;
};

export type PlanetaryAnomaly = {
  kind: string;
  details?: string;
};

// -------------------------------------------------------------
// Institute Types
// -------------------------------------------------------------

export type EpistemicEventAction =
  | "observe"
  | "infer"
  | "update"
  | "reject";

export type EpistemicEvent = {
  id: string;
  action: EpistemicEventAction;
  payload: unknown;
  time: number;
};

export type EpistemicTimeline = EpistemicEvent[];

export type InstituteInferenceFact = {
  id: string;
  kind: InferenceFactKind;
  confidence: number;
  payload: unknown;
};

export type InstituteInferenceHypothesis = {
  id: string;
  facts: InstituteInferenceFact[];
  confidence: number;
};

export type InstituteQuantumBranch = QuantumBranch;

export type InstituteSimulationDelta = SimTickDiff;

export type InstituteTruth = {
  id: string;
  createdAt: number;
  updatedAt: number;
  payload: unknown;
  stability: number;
};

export type InstituteTruthFormation = {
  truth: InstituteTruth;
  advisory?: string;
};

export type InstituteCanon = {
  truths: InstituteTruth[];
  signature: string;
};

export type InstituteState = {
  canon: InstituteCanon;
  timeline: EpistemicTimeline;
};

// -------------------------------------------------------------
// Inference Types
// -------------------------------------------------------------

export type InferenceFactKind =
  | "behavior"
  | "identity"
  | "window"
  | "tec"
  | "substrate"
  | "governance";

export type InferenceFact = {
  id: string;
  kind: InferenceFactKind;
  payload: unknown;
};

export type InferenceHypothesis = {
  id: string;
  facts: InferenceFact[];
  confidence: number;
};

export type InferenceRecommendationTarget =
  | "substrate"
  | "identity"
  | "window"
  | "tec";

export type InferenceRecommendation = {
  id: string;
  target: InferenceRecommendationTarget;
  payload: unknown;
};

export type InferenceArtifacts = {
  facts: InferenceFact[];
  hypotheses: InferenceHypothesis[];
  recommendations: InferenceRecommendation[];
};
