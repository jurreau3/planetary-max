import type { KernelResult } from "./types";

export type AutonomyMode = "off" | "core" | "full" | undefined;

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

  const phases = resolvedMode === "core" ? [14, 15, 16] : [14, 15, 16, 17, 18];

  return {
    ...result,
    status: result.status ?? 200,
    body: {
      ...(result.body as Record<string, unknown> | undefined),
      autonomyMode: resolvedMode,
      autonomyPhases: phases,
    },
  };
}
