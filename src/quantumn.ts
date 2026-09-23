import { QuantumBranch, QuantumOverlay, QuantumCollapsePolicy } from "./types";

export const QUANTUM_STATE_KEY = "quantum.overlay";

async function sha256(input: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(input));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

export async function generateQuantumOverlay(
  branches: QuantumBranch[],
  policy: QuantumCollapsePolicy,
  predecessorId?: string | null
): Promise<QuantumOverlay> {
  const ids = new Set<string>();
  for (const b of branches) {
    if (ids.has(b.id)) throw new Error("DUPLICATE_BRANCH_ID");
    ids.add(b.id);
  }

  const normalized = normalizeProbabilities(branches);

  const overlayState = { branches: normalized, policy };
  const signature = await sha256(overlayState);
  const curvature = computeCurvature(normalized);

  const effectivePredecessor =
    predecessorId && predecessorId !== signature ? predecessorId : null;

  return {
    branches: normalized,
    curvature,
    signature,
    collapsePolicy: policy,
  };
}

export function normalizeProbabilities(branches: QuantumBranch[]): QuantumBranch[] {
  const total = branches.reduce((sum, b) => sum + b.probability, 0);
  if (total === 0) return branches;

  let acc = 0;
  return branches.map((b, idx) => {
    const p = idx === branches.length - 1 ? Math.max(0, 1 - acc) : b.probability / total;
    acc += p;
    return { ...b, probability: p };
  });
}

export function collapseQuantumBranches(
  overlay: QuantumOverlay,
  seed?: number
): QuantumBranch {
  switch (overlay.collapsePolicy) {
    case "deterministic":
      return overlay.branches.reduce((best, b) =>
        b.probability > best.probability ? b : best
      );
    case "probabilistic":
      return probabilisticCollapse(overlay.branches, seed);
    case "governed":
      throw new Error("GOVERNED_COLLAPSE_MUST_BE_HANDLED_UPSTREAM");
  }
}

function probabilisticCollapse(branches: QuantumBranch[], seed?: number): QuantumBranch {
  const rng = seedRandom(seed);
  const r = rng();
  let acc = 0;
  for (const b of branches) {
    acc += b.probability;
    if (r <= acc) return b;
  }
  return branches[branches.length - 1];
}

function seedRandom(seed?: number): () => number {
  let s = seed ?? Date.now();
  return () => {
    s = (s * 1664525 + 1013904223) % 0xffffffff;
    return s / 0xffffffff;
  };
}

function computeCurvature(branches: QuantumBranch[]): number {
  const eps = 1e-12;
  return -branches.reduce(
    (sum, b) =>
      sum + (b.probability > 0 ? b.probability * Math.log(b.probability + eps) : 0),
    0
  );
}
