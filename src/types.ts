// -------------------------------------------------------------
// Core Bindings
// -------------------------------------------------------------
export type Bindings = {
  PLANETARY_MODE?: string;
  UMBRELLA_ENFORCEMENT?: string;
  MAX_OS_1: Fetcher;
};

// -------------------------------------------------------------
// Governance Types
// -------------------------------------------------------------
export type GovernanceDecision = "allowed" | "denied";

export type GovernanceMetadata = {
  id: string;
  kind: "policy" | "constraint" | "signal";
  source: "institute" | "portal" | "planetary" | "market";
  decision: GovernanceDecision;
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
};

export type GovernanceInference = {
  metadata: GovernanceMetadata[];
  curvature: number;
};

// -------------------------------------------------------------
// Kernel Types
// -------------------------------------------------------------
export type KernelEnvelope = {
  type: string;
  payload: Record<string, unknown>;
  identity: string;
  governanceContext: Record<string, unknown>;
  enforcement?: string;
};

export type KernelLane = {
  id: string;
  data: Record<string, unknown>;
};

export type KernelResult = {
  ok: boolean;
  lanes: KernelLane[];
  signature: string;
  curvature: number;
};

// -------------------------------------------------------------
// Quantum Types
// -------------------------------------------------------------
export type QuantumCollapsePolicy =
  | "deterministic"
  | "probabilistic"
  | "governed";

export type QuantumBranch = {
  id: string;
  probability: number;
  stateDelta: Readonly<Record<string, unknown>>;
  signature: string;
};

export type QuantumOverlay = {
  branches: Readonly<QuantumBranch[]>;
  curvature: number;
  signature: string;
  collapsePolicy: QuantumCollapsePolicy;
};

export type QuantumSignature = string;

export type QuantumState = {
  overlay: QuantumOverlay;
  collapsed: Record<string, unknown>;
};

export type QuantumGovernanceContext = {
  metadata: GovernanceMetadata[];
  collapsePolicy: QuantumCollapsePolicy;
};

// -------------------------------------------------------------
// Inference Types
// -------------------------------------------------------------
export type InferenceFactKind =
  | "quantum"
  | "simulation"
  | "identity"
  | "planetary"
  | "institute";

export type InferenceFact = {
  kind: InferenceFactKind;
  data: Record<string, unknown>;
};

export type InferenceHypothesis = {
  id: string;
  confidence: number;
  facts: InferenceFact[];
};

export type InferenceRecommendationTarget =
  | "quantum"
  | "simulation"
  | "identity"
  | "planetary"
  | "institute";

export type InferenceRecommendation = {
  target: InferenceRecommendationTarget;
  action: string;
  rationale: string;
};

export type InferenceArtifacts = {
  overlay: QuantumOverlay;
  facts: InferenceFact[];
};

// -------------------------------------------------------------
// Institute Types
// -------------------------------------------------------------
export type InstituteTruth = {
  id: string;
  confidence: number;
  data: Record<string, unknown>;
};

export type InstituteTruthFormation = {
  truths: InstituteTruth[];
  stability: number;
};

export type InstituteInferenceFact = InferenceFact;

export type InstituteInferenceHypothesis = InferenceHypothesis;

export type InstituteQuantumBranch = QuantumBranch;

export type InstituteSimulationDelta = Record<string, unknown>;

export type InstituteState = {
  truths: InstituteTruth[];
  hypotheses: InstituteInferenceHypothesis[];
  stability: number;
};

// -------------------------------------------------------------
// Planetary Types
// -------------------------------------------------------------
export type PlanetaryIdentity = {
  id: string;
  signature: string;
};

export type PlanetarySubstrate = {
  curvature: number;
  signature: string;
};

export type PlanetaryQuantumState = QuantumState;

export type PlanetaryGovernanceContext = {
  metadata: GovernanceMetadata[];
};

export type PlanetaryNodeSnapshot = {
  id: string;
  state: Record<string, unknown>;
};

export type PlanetaryAnomaly = {
  id: string;
  description: string;
};

export type PlanetaryCanon = {
  id: string;
  truths: InstituteTruth[];
};

export type PlanetaryState = {
  identity: PlanetaryIdentity;
  substrate: PlanetarySubstrate;
  quantum: PlanetaryQuantumState;
  canon: PlanetaryCanon;
};

export type PlanetarySynchronization = {
  state: PlanetaryState;
  anomalies: PlanetaryAnomaly[];
};

// -------------------------------------------------------------
// Simulation Types
// -------------------------------------------------------------
export type SimEventType =
  | "agent.move"
  | "agent.interact"
  | "window.update"
  | "substrate.update";

export type SimEvent = {
  id: string;
  type: SimEventType;
  payload: Record<string, unknown>;
};

export type SimAgentState = {
  id: string;
  position: Record<string, number>;
  traits: Record<string, unknown>;
};

export type SimWindowState = {
  id: string;
  focus: boolean;
  timeline: string[];
};

export type SimSubstrateState = {
  curvature: number;
  signature: string;
};

export type SimTickDiff = {
  events: SimEvent[];
  agents: SimAgentState[];
  windows: SimWindowState[];
  substrate: SimSubstrateState;
};

// -------------------------------------------------------------
// Introspection Types
// -------------------------------------------------------------
export type IntrospectionKind =
  | "inference"
  | "sim.behavior"
  | "identity.timeline"
  | "windows.focus"
  | "windows.state"
  | "windows.timeline"
  | "tec.pipeline"
  | "substrate.state"
  | "messages"
  | "logs"
  | "quantum.state"
  | "quantum.branches"
  | "quantum.curvature"
  | "quantum.signature"
  | "umbrella.enforcement"
  | "kernel.heatmap"
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
