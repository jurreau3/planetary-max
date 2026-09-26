//
// MAX‑SIM Substrate
// Simulation state + agents + windows + TEC tasks + envelopes
//

import type { JsonObject } from "./contracts";
import type {
  SimSubstrateState,
  SimAgentState,
  SimWindowState,
  SimTecTaskState,
  SimEvent,
  SimTickDiff,
} from "./types";

import { nowTick, cloneJson } from "./utils";

/**
 * createEmptySimState
 *
 * Base simulation state when MAX‑SIM boots.
 */
export function createEmptySimState(): SimSubstrateState {
  return {
    tick: 0,
    agents: {},
    windows: {},
    substrate: {},
  };
}

/**
 * createSimAgent
 *
 * Creates a new simulation agent.
 */
export function createSimAgent(
  id: string,
  role: string,
  state: JsonObject = {},
): SimAgentState {
  return {
    id,
    role,
    state,
  };
}

/**
 * createSimWindow
 *
 * Creates a new simulation window.
 */
export function createSimWindow(
  id: string,
  title: string,
  x: number,
  y: number,
  width: number,
  height: number,
): SimWindowState {
  return {
    id,
    title,
    x,
    y,
    width,
    height,
    focused: false,
  };
}

/**
 * createTecTask
 *
 * Creates a new TEC pipeline task.
 */
export function createTecTask(
  id: string,
  metadata: JsonObject = {},
): SimTecTaskState {
  return {
    id,
    status: "pending",
    metadata,
  };
}

/**
 * applySimEvent
 *
 * Applies a simulation event to the substrate.
 */
export function applySimEvent(
  state: SimSubstrateState,
  event: SimEvent,
): SimSubstrateState {
  const next = cloneJson(state);
  next.tick = event.tick;

  // Event payload is user-defined; merge into substrate.
  next.substrate = {
    ...next.substrate,
    ...event.payload,
  };

  return next;
}

/**
 * computeSimDiff
 *
 * Computes a diff between two simulation ticks.
 */
export function computeSimDiff(
  prev: SimSubstrateState,
  next: SimSubstrateState,
): SimTickDiff {
  const diff: JsonObject = {};

  for (const key of Object.keys(next.substrate)) {
    if (JSON.stringify(prev.substrate[key]) !== JSON.stringify(next.substrate[key])) {
      diff[key] = next.substrate[key];
    }
  }

  return {
    tick: next.tick,
    diff,
  };
}

/**
 * toSimEnvelope
 *
 * Converts simulation state into a public JSON envelope.
 */
export function toSimEnvelope(state: SimSubstrateState): JsonObject {
  return {
    ok: true,
    service: "MAX-SIM",
    tick: state.tick,
    agents: state.agents,
    windows: state.windows,
    substrate: state.substrate,
  };
}

/**
 * toSimDiffEnvelope
 *
 * Converts a simulation diff into a public JSON envelope.
 */
export function toSimDiffEnvelope(diff: SimTickDiff): JsonObject {
  return {
    ok: true,
    service: "MAX-SIM-DIFF",
    tick: diff.tick,
    diff: diff.diff,
  };
}

/**
 * nextSimTick
 *
 * Advances the simulation tick and returns the new state.
 */
export function nextSimTick(state: SimSubstrateState): SimSubstrateState {
  return {
    ...state,
    tick: nowTick(),
  };
}
