import type { KernelEnvelope } from "./types";

export async function callKernel(_env: unknown, _envelope: KernelEnvelope): Promise<Response> {
  return new Response(
    JSON.stringify({
      ok: true,
      status: 200,
      body: { received: true },
      governance: _envelope.governance,
    }),
    {
      status: 200,
      headers: { "Content-Type": "application/json" },
    },
  );
}
