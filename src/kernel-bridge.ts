import type { Bindings, KernelEnvelope } from './contracts';

/**
 * callKernel
 *
 * Sends a fully constructed KernelEnvelope to the PortalKernel Durable Object.
 * Handles forwarding, error wrapping, and JSON normalization.
 */
export async function callKernel(
  env: Bindings,
  envelope: KernelEnvelope
): Promise<Response> {
  const id = env.PORTAL_KERNEL.idFromName('kernel');
  const stub = env.PORTAL_KERNEL.get(id);

  const request = new Request('https://portal/kernel', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(envelope),
  });

  try {
    const res = await stub.fetch(request);

    // Kernel should always return JSON
    const text = await res.text();
    let json: unknown;

    try {
      json = JSON.parse(text);
    } catch {
      return Response.json(
        {
          ok: false,
          error: {
            code: 'KERNEL_INVALID_JSON',
            message: 'Kernel returned non‑JSON response',
            raw: text,
          },
        },
        { status: 500 }
      );
    }

    return Response.json(json, { status: res.status });
  } catch (err: any) {
    return Response.json(
      {
        ok: false,
        error: {
          code: 'KERNEL_BRIDGE_FAILURE',
          message: err?.message ?? 'Kernel bridge failed',
        },
      },
      { status: 503 }
    );
  }
}
