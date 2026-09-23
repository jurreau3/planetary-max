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

export type GovernanceMetadata = {
  id: string;
  kind: "policy" | "constraint" | "signal";
  source: "institute" | "portal" | "planetary" | "market";
  createdAt: string;
  updatedAt?: string;
  tags?: string[];
};

export type GovernanceContext = {
  instituteId: string;
  portalId?: string;
  planetaryId?: string;
  metadata?: GovernanceMetadata[];
};

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
