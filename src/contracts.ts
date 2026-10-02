import type { Bindings, KernelEnvelope, KernelResult } from "./types";

export type { Bindings, KernelEnvelope, KernelResult };

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createEnvelope(
  type: string,
  payload: Record<string, unknown>,
  identity: string,
  governanceContext: Record<string, unknown> = {},
): KernelEnvelope {
  return {
    lane: "sim",
    payload,
    identity,
    governance: {
      mode: "strict",
      decision: "allow",
      reason: type,
    },
  };
}

export function extractLaneData(response: unknown): unknown {
  if (!isRecord(response)) return {};
  if ("body" in response) return response.body;
  return {};
}

export function normalizeResponse(result: KernelResult, envelope: KernelEnvelope): Record<string, unknown> {
  if (!result.ok) return result as unknown as Record<string, unknown>;

  return {
    ok: true,
    data: result.body ?? {},
    meta: {
      lane: envelope.lane,
      identity: result.identity ?? envelope.identity,
      governance: result.governance ?? envelope.governance,
    },
  };
}
