export interface PhaseStatus {
  phase: number;
  coherence: number;
  signals: Record<string, unknown>;
}
