//
// Unified MAX‑Institute + Portal‑OS Type Substrate
// Planetary‑MAX Quantum Substrate + Simulation + Institute
//

import type { JsonObject } from "./contracts";

//
// Quantum Substrate
//
export type QuantumOverlay = {
  branches: JsonObject[];
  curvature: JsonObject;
  signature: string;
};

//
// Simulation Substrate
//
export type SimWindowState = {
  id: string;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  focused: boolean;
};

export type SimAgentState = {
  id: string;
  role: string;
  state: JsonObject;
};

export type SimSubstrateState = {
  tick: number;
  agents: Record<string, SimAgentState>;
  windows: Record<string, SimWindowState>;
  substrate: JsonObject;
};

export type SimTecTaskState = {
  id: string;
  status: "pending" | "running" | "complete" | "failed";
  metadata: JsonObject;
};

export type SimEvent = {
  tick: number;
  type: string;
  payload: JsonObject;
};

export type SimTickDiff = {
  tick: number;
  diff: JsonObject;
};

//
// Kernel Result
//
export type KernelResult = {
  ok: boolean;
  body?: {
    messages?: JsonObject[];
    logs?: JsonObject[];
    inference?: JsonObject;
  };
};

//
// Institute Substrate
//
export type InstituteTruth = {
  id: string;
  stability: number;
  payload: JsonObject;
};

export type InstituteCanon = {
  signature: string;
  truths: InstituteTruth[];
};

export type EpistemicTimeline = {
  events: Array<{
    id: string;
    timestamp: number;
    payload: JsonObject;
  }>;
};

export type InstituteState = {
  canon: InstituteCanon;
  timeline: EpistemicTimeline;
};

//
// Planetary Substrate
//
export type PlanetaryNodeSnapshot = {
  id: string;
  identity: {
    id: string;
    signature: string;
  };
  substrate: JsonObject;
  quantum: JsonObject;
};

export type PlanetaryState = {
  globalTick: number;
  nodes: PlanetaryNodeSnapshot[];
  identities: Record<string, JsonObject>;
  substrate: Record<string, JsonObject>;
  quantum: Record<string, JsonObject>;
  canon: JsonObject;
  governance: JsonObject;
  advisories: JsonObject[];
  synchronizedAt: number;
  packetSignature: string;
};

//
// Portal‑OS Kernel State
//
export type PortalKernelState = {
  windows: JsonObject;
  portal: JsonObject;
  os: JsonObject;
};
