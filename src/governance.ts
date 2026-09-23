import type { GovernanceMetadata, KernelEnvelope, UmbrellaMode } from "./types";

export function resolveUmbrellaMode(value: string | undefined): UmbrellaMode {
  return value === "strict" || value === "advisory" || value === "off" ? value : "strict";
}

export function defaultGovernance(mode: UmbrellaMode): GovernanceMetadata {
  return Object.freeze({
    mode,
    decision: mode === "off" ? "bypassed" : mode === "advisory" ? "advisory" : "allowed",
    deltas: Object.freeze([]),
  });
}

export function evaluateGovernance(
  envelope: KernelEnvelope,
  configuredMode: string | undefined,
): GovernanceMetadata {
  const mode: UmbrellaMode = resolveUmbrellaMode(configuredMode);
  if (mode === "off") return defaultGovernance(mode);

  const lane: string = laneForType(envelope.type);
  const operation: string = envelope.type === "umbrella.os" && typeof envelope.payload.operation === "string"
    ? envelope.payload.operation
    : envelope.type;
  const context: Readonly<Record<string, unknown>> = envelope.governanceContext;
  const deltas: Array<Readonly<Record<string, unknown>>> = [];

  if (context.decision === "denied" || context.deny === true) {
    deltas.push(Object.freeze({ rule: "explicit-deny", lane }));
  }
  if (Array.isArray(context.allowedLanes) && !context.allowedLanes.includes(lane)) {
    deltas.push(Object.freeze({ rule: "lane-access", lane }));
  }
  if (isRecord(context.permissions) && context.permissions[operation] === false) {
    deltas.push(Object.freeze({ rule: "agent-permission", operation }));
  }
  if (envelope.payload.structuralTruth === false) {
    deltas.push(Object.freeze({ rule: "structural-truth", invariant: "structuralTruth" }));
  }
  if (Array.isArray(context.allowedIdentities) && !context.allowedIdentities.includes(envelope.identity)) {
    deltas.push(Object.freeze({ rule: "identity-physics", identityAccepted: false }));
  }

  const denied: boolean = deltas.length > 0 && mode === "strict";
  return Object.freeze({
    mode,
    decision: denied ? "denied" : mode === "advisory" ? "advisory" : "allowed",
    ...(deltas.length > 0
      ? { rationale: denied ? "Umbrella policy denied the operation" : "Umbrella policy recorded advisory findings" }
      : {}),
    deltas: Object.freeze(deltas),
  });
}

export function laneForType(type: string): string {
  if (type.startsWith("introspection.")) return "introspection";
  if (type === "identity.physics.license") return "umbrella.identity-physics";
  if (type === "umbrella.os" || type.startsWith("os.")) return "umbrella.os";
  if (type.startsWith("umbrella.") || type.includes("license")) return "umbrella";
  if (type.startsWith("universe.")) return "universe";
  return "kernel";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
