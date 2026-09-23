import { QuantumOverlay } from "./types";
import { QUANTUM_STATE_KEY } from "./quantumn";

type AuthContext = { identity: string | null };

function requireAuth(ctx: AuthContext) {
  if (!ctx.identity) throw new Error("UNAUTHENTICATED");
}

export function introspectQuantumState(
  globalState: Record<string, unknown>,
  ctx: AuthContext
): QuantumOverlay | null {
  requireAuth(ctx);
  return (globalState[QUANTUM_STATE_KEY] as QuantumOverlay) ?? null;
}

export function introspectQuantumBranches(
  globalState: Record<string, unknown>,
  ctx: AuthContext
) {
  const overlay = introspectQuantumState(globalState, ctx);
  return overlay ? overlay.branches : [];
}

export function introspectQuantumCurvature(
  globalState: Record<string, unknown>,
  ctx: AuthContext
) {
  const overlay = introspectQuantumState(globalState, ctx);
  return overlay ? overlay.curvature : null;
}

export function introspectQuantumSignature(
  globalState: Record<string, unknown>,
  ctx: AuthContext
) {
  const overlay = introspectQuantumState(globalState, ctx);
  return overlay ? overlay.signature : null;
}
