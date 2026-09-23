import type {
  Bindings,
  GovernanceMetadata,
  KernelEnvelope,
  KernelLane,
  KernelResult,
  UmbrellaMode,
} from "./types";

const KERNEL_OBJECT_NAME = "portal-kernel";
const KERNEL_BRIDGE_URL = "https://portal-kernel.invalid/api/kernel/message";

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function createEnvelope(
  type: string,
  payload: Record<string, unknown>,
  identity: string,
  governanceContext: Record<string, unknown>,
  configuredMode?: string,
): KernelEnvelope {
  const mode: UmbrellaMode = resolveMode(configuredMode);
  const clonedPayload: Record<string, unknown> = structuredClone(payload);
  const clonedContext: Record<string, unknown> = structuredClone(governanceContext);
  const decision: "allowed" | "denied" | "advisory" =
    mode === "advisory"
      ? "advisory"
      : mode === "strict" && clonedContext.decision === "denied"
        ? "denied"
        : "allowed";
  const rationale: string =
    typeof clonedContext.rationale === "string" && clonedContext.rationale.trim()
      ? clonedContext.rationale
      : decision === "denied"
        ? "Umbrella governance denied the operation"
        : mode === "advisory"
          ? "Umbrella governance is advisory"
          : mode === "off"
            ? "Umbrella governance is disabled"
            : "Umbrella governance allows the operation";
  return deepFreeze({
    id: crypto.randomUUID(),
    type,
    payload: deepFreeze(clonedPayload),
    identity,
    governanceContext: deepFreeze({
      ...clonedContext,
      mode,
      umbrellaMode: mode,
      decision,
      rationale,
    }),
  });
}

export async function callKernel(env: Bindings, envelope: KernelEnvelope): Promise<Response> {
  const id: DurableObjectId = env.PORTAL_KERNEL.idFromName(KERNEL_OBJECT_NAME);
  return env.PORTAL_KERNEL.get(id).fetch(
    new Request(KERNEL_BRIDGE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(envelope),
    }),
  );
}

export async function readJsonObject(
  request: Request,
  message: string,
): Promise<Record<string, unknown> | Response> {
  try {
    const value: unknown = await request.json();
    return isRecord(value) ? value : failureResponse("INVALID_JSON", message, 400);
  } catch {
    return failureResponse("INVALID_JSON", message, 400);
  }
}

export async function readKernelResult(
  response: Response,
  envelope: KernelEnvelope,
  kernelName: string,
): Promise<KernelResult> {
  let value: unknown;
  try {
    value = await response.json();
  } catch {
    return failureResult("INVALID_KERNEL_RESPONSE", "Kernel returned non-JSON", envelope, { kernel: kernelName });
  }

  if (!isRecord(value) || typeof value.ok !== "boolean") {
    return failureResult(
      "INVALID_KERNEL_RESPONSE",
      "Kernel returned a non-object or malformed result",
      envelope,
      { kernel: kernelName },
    );
  }

  const suppliedMeta: Record<string, unknown> = isRecord(value.meta) ? value.meta : {};
  const governance: unknown = isGovernanceMetadata(suppliedMeta.governance)
    ? suppliedMeta.governance
    : governanceFromEnvelope(envelope);
  const meta: Readonly<Record<string, unknown>> = {
    ...suppliedMeta,
    kernel: kernelName,
    messageId: envelope.id,
    type: envelope.type,
    identity: { propagated: true },
    governance,
  };

  if (!value.ok) {
    if (!isKernelError(value.error)) {
      return failureResult("INVALID_KERNEL_RESPONSE", "Kernel returned a malformed error", envelope, meta);
    }
    return Object.freeze({ ok: false, error: Object.freeze(value.error), meta });
  }

  return Object.freeze({
    ok: true,
    ...(value.result !== undefined
      ? { result: value.result }
      : isRecord(value.data)
        ? { result: value.data }
        : {}),
    meta,
  });
}

export function failureResponse(code: string, message: string, status: number): Response {
  return Response.json({ ok: false, error: { code, message } }, { status });
}

export function failureResult(
  code: string,
  message: string,
  envelope?: KernelEnvelope,
  additionalMeta: Readonly<Record<string, unknown>> = {},
): KernelResult {
  const meta: Readonly<Record<string, unknown>> | undefined = envelope
    ? { ...additionalMeta, messageId: envelope.id, type: envelope.type }
    : Object.keys(additionalMeta).length > 0
      ? additionalMeta
      : undefined;
  return Object.freeze({
    ok: false,
    error: Object.freeze({ code, message }),
    ...(meta === undefined ? {} : { meta }),
  });
}

export function governanceFailureResult(
  envelope: KernelEnvelope,
  governance: GovernanceMetadata,
): KernelResult {
  return failureResult(
    "FORBIDDEN",
    "Umbrella governance denied the operation",
    envelope,
    { governance },
  );
}

export function resultResponse(result: KernelResult, upstreamStatus: number): Response {
  if (result.ok && (upstreamStatus < 200 || upstreamStatus >= 300)) {
    return Response.json(
      {
        ok: false,
        error: {
          code: "INVALID_KERNEL_RESPONSE",
          message: "Kernel returned a success result with a non-success status",
        },
        ...(result.meta === undefined ? {} : { meta: result.meta }),
      },
      { status: 502 },
    );
  }
  const status: number = result.ok
    ? upstreamStatus
    : errorStatus(result.error?.code, upstreamStatus);
  return Response.json(result, { status });
}

export function extractLaneData(lanes: ReadonlyArray<KernelLane>): Readonly<Record<string, unknown>> {
  return lanes[0]?.result.results[0]?.result.data ?? {};
}

function isKernelError(value: unknown): value is { code: string; message: string } {
  return isRecord(value) && typeof value.code === "string" && typeof value.message === "string";
}

function governanceFromEnvelope(envelope: KernelEnvelope): GovernanceMetadata {
  const mode: UmbrellaMode = resolveMode(
    typeof envelope.governanceContext.mode === "string"
      ? envelope.governanceContext.mode
      : undefined,
  );
  return {
    mode,
    decision: mode === "off" ? "bypassed" : mode === "advisory" ? "advisory" : "allowed",
    deltas: [],
  };
}

function isGovernanceMetadata(value: unknown): value is GovernanceMetadata {
  if (!isRecord(value)) return false;
  return (
    (value.mode === "strict" || value.mode === "advisory" || value.mode === "off") &&
    (value.decision === "allowed" ||
      value.decision === "denied" ||
      value.decision === "advisory" ||
      value.decision === "bypassed") &&
    Array.isArray(value.deltas)
  );
}

function errorStatus(code: string | undefined, upstreamStatus: number): number {
  if (code === "UNAUTHENTICATED") return 401;
  if (code === "FORBIDDEN") return 403;
  if (code === "INVALID_MESSAGE" || code === "INVALID_JSON") return 400;
  if (code === "INVALID_KERNEL_RESPONSE") return 502;
  return upstreamStatus >= 400 ? upstreamStatus : 500;
}

function resolveMode(value: string | undefined): UmbrellaMode {
  return value === "strict" || value === "advisory" || value === "off" ? value : "strict";
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
