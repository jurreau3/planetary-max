export type QuantumCollapsePolicy = "deterministic" | "probabilistic" | "governed";

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
