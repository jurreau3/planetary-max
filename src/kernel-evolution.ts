import type { KernelResult } from "./types";

export type AutonomyMode = "off" | "core" | "full" | undefined;

type AutonomyMeta = {
  mode: "off" | "core" | "full";
  phasesExecuted: number[];
  timestamp: number;
};

export function evolveKernelResult(result: KernelResult, mode: AutonomyMode): KernelResult {
  if (!result.ok) {
    return {
      ...result,
      ok: false,
      status: result.status ?? 500,
    };
  }

  const resolvedMode: "off" | "core" | "full" = mode === "core" || mode === "full" ? mode : "off";
  if (resolvedMode === "off") {
    return { ...result, ok: true, status: result.status ?? 200 };
  }

  const corePhases = [14, 15, 16];
  const fullPhases = [14, 15, 16, 17, 18];
  const phasesExecuted = resolvedMode === "core" ? corePhases : fullPhases;

  const autonomyMeta: AutonomyMeta = {
    mode: resolvedMode,
    phasesExecuted,
    timestamp: Date.now(),
  };

  return {
    ...result,
    ok: true,
    status: result.status ?? 200,
    body: {
      ...(result.body as Record<string, unknown> | undefined),
      autonomyMode: autonomyMeta.mode,
      autonomyPhases: autonomyMeta.phasesExecuted,
    },
  };
}
