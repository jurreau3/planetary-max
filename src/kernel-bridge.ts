import { Bindings } from "./types";

export type KernelEnvelope = {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  identity: string;
  governanceContext: Record<string, unknown>;
};

export type KernelResult = {
  ok: boolean;
  result?: unknown;
  error?: { code: string; message: string };
  meta?: Record<string, unknown>;
};

export function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export function failureResponse(
  code: string,
  message: string,
  status: number,
): Response {
  return Response.json(
    {
      ok: false,
      error: { code, message },
    },
    { status },
  );
}

export function failureResult(
  code: string,
  message: string,
  envelope: KernelEnvelope,
): KernelResult {
  return {
    ok: false,
    error: { code, message },
    meta: {
      messageId: envelope.id,
      type: envelope.type,
    },
  };
}

export function resultResponse(result: KernelResult, status: number): Response {
  return Response.json(result, { status });
}

export async function readJsonObject(
  req: Request,
  message: string,
): Promise<Record<string, unknown> | Response> {
  try {
    const json = await req.json();
    if (!isRecord(json)) {
      return failureResponse("INVALID_JSON", message, 400);
    }
    return json;
  } catch {
    return failureResponse("INVALID_JSON", message, 400);
  }
}

export async function readKernelResult(
  response: Response,
  envelope: KernelEnvelope,
  kernelName: string,
): Promise<KernelResult> {
  let body: unknown;
  try {
    body = await response.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "INVALID_KERNEL_RESPONSE",
        message: "Kernel returned non‑JSON",
      },
      meta: { kernel: kernelName, messageId: envelope.id },
    };
  }

  if (!isRecord(body)) {
    return {
      ok: false,
      error: {
        code: "INVALID_KERNEL_RESPONSE",
        message: "Kernel returned non‑object",
      },
      meta: { kernel: kernelName, messageId: envelope.id },
    };
  }

  return {
    ok: Boolean(body.ok),
    result: body.result,
    error: body.error,
    meta: {
      ...(body.meta ?? {}),
      kernel: kernelName,
      messageId: envelope.id,
      type: envelope.type,
    },
  };
}

export function createEnvelope(
  type: string,
  payload: Record<string, unknown>,
  identity: string,
  governanceContext: Record<string, unknown>,
  umbrellaMode: string,
): KernelEnvelope {
  return {
    id: crypto.randomUUID(),
    type,
    payload,
    identity,
    governanceContext: {
      ...governanceContext,
      umbrellaMode,
    },
  };
}
