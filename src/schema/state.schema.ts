export interface StateRead {
  state: {
    identity: Record<string, unknown>;
    runtime: Record<string, unknown>;
    planetary: Record<string, unknown>;
    phase: number;
  };
}
