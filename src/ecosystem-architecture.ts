export type JsonValue = string | number | boolean | null | JsonObject | JsonValue[];
export type JsonObject = { [key: string]: JsonValue };

export type KernelContext = Readonly<{
  identity?: Record<string, unknown>;
  meta?: Record<string, unknown>;
  governanceContext?: Record<string, unknown>;
  simCoreState?: Record<string, unknown>;
  quantumState?: Record<string, unknown>;
  storage?: Record<string, unknown>;
  event?: Record<string, unknown>;
  envelope?: import("./types").KernelEnvelope;
  input?: unknown;
}>;

const asObject = (value: unknown, fallback: Record<string, unknown> = {}): Record<string, unknown> => {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  return fallback;
};

const coerceNumber = (value: unknown, fallback: number): number => {
  const parsed = Number(value ?? fallback);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const clampUnit = (value: number): number => Math.min(1, Math.max(0, value));

const average = (...values: number[]): number => {
  if (values.length === 0) return 0;
  const total = values.reduce((sum, entry) => sum + entry, 0);
  return total / values.length;
};

export function resolveUmbrellaIntelligence(context: KernelContext): Record<string, unknown> {
  const governance = asObject(context.governanceContext);
  const meta = asObject(context.meta);
  const identity = asObject(context.identity);
  const simCoreState = asObject(context.simCoreState);

  const mode = typeof governance.mode === "string" ? governance.mode : "strict";
  const identitySignal = coerceNumber(identity.curvature, 0.5);
  const simSignal = coerceNumber(simCoreState.confidence, 0.7);
  const telemetryBias = coerceNumber(meta.telemetryBias, 0.5);

  return {
    umbrella: {
      mode,
      identitySignal,
      simSignal,
      telemetryBias,
      decision: coerceNumber(governance.threshold, 0.6) >= 0.6 ? "allow" : "review",
    },
    intelligence: {
      integrity: clampUnit(average(identitySignal, simSignal, telemetryBias)),
      source: "umbrella-core",
      updatedAt: Date.now(),
    },
  };
}

export function meshRoute(envelope: import("./types").KernelEnvelope): Record<string, unknown> {
  const lane = envelope.lane ?? "sim";
  const identity = typeof envelope.identity === "string" ? envelope.identity : "system";
  const payload = asObject(envelope.payload);

  return {
    route: {
      lane,
      identity,
      destination: lane === "umbrella" ? "governance" : "kernel",
    },
    payload,
    nextStep: "dispatch",
  };
}
