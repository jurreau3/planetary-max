export interface KernelStatus {
  status: string;
  tick: number;
  signals: Record<string, unknown>;
  kernelMode: string;
}

export interface StateRead {
  state: {
    identity: Record<string, unknown>;
    runtime: Record<string, unknown>;
    planetary: Record<string, unknown>;
    phase: number;
  };
}

export interface UmbrellaStatus {
  rules: unknown[];
  active: boolean;
  lastUpdate: number;
}

export interface PhaseStatus {
  phase: number;
  coherence: number;
  signals: Record<string, unknown>;
}

export interface PlanetaryMode {
  mode: string;
}

export interface VersionRead {
  version: string;
  build: string;
  commit: string;
}
