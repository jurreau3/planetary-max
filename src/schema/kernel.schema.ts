export interface KernelStatus {
  status: string;
  tick: number;
  signals: Record<string, unknown>;
  kernelMode: string;
}
