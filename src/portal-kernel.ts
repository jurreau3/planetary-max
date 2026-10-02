import type { Bindings, KernelEnvelope, KernelResult } from "./types";

export class PortalKernel {
  private readonly env: Bindings;

  constructor(env: Bindings) {
    this.env = env;
  }

  async dispatch(envelope: KernelEnvelope): Promise<KernelResult> {
    return {
      ok: true,
      status: 200,
      body: { envelope, received: true },
      governance: envelope.governance,
    };
  }
}
