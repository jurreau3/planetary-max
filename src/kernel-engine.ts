import type { KernelEnvelope, KernelResult } from "./types";

export class KernelEngine {
  private readonly config: Record<string, unknown>;

  constructor(config: Record<string, unknown>) {
    this.config = config;
  }

  async dispatch(envelope: KernelEnvelope): Promise<KernelResult> {
    return {
      ok: true,
      status: 200,
      body: { envelope, config: this.config },
      governance: envelope.governance,
    };
  }
}
