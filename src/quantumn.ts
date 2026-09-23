//
// MAX‑Institute Quantum Substrate
// Unified Portal‑OS Wing
// Planetary‑MAX Deterministic Quantum Layer
//

import {
  QuantumBranch,
  QuantumOverlay,
  QuantumCollapsePolicy,
  QuantumGovernanceContext,
} from "./types";

export const QUANTUM_STATE_KEY = "quantum.overlay";

// -------------------------------------------------------------
// SHA‑256 Signature
// -------------------------------------------------------------

async function sha256(input: unknown): Promise<string> {
  const data = new TextEncoder().encode(JSON.stringify(input));
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// -------------------------------------------------------------
// Branch Generation (Classical → Quantum)
// -------------------------------------------------------------

export function generateQuantumBranches(
  classical: Record<string, unknown>
): QuantumBranch[] {
  const keys = Object.keys(classical);
  if (keys.length === 0) {
    return [
      {
        id: "branch-0",
        probability: 1,
        stateDelta: {},
        signature: "empty",
      },
    ];
  }

  return keys.map((key, idx) => ({
    id: `branch-${idx}`,
    probability: 1 / keys.length,
    stateDelta: { [key]: classical[key] },
    signature: key,
  }));
}

// -------------------------------------------------------------
// Probability Normalization
// -------------------------------------------------------------

export function normalizeProbabilities(
  branches: QuantumBranch[]
): QuantumBranch[] {
  const total = branches.reduce((sum, b) => sum + b.probability, 0);
  if (total === 0) return branches;

  let acc = 0;
  return branches.map((b, idx) => {
    const p =
      idx === branches.length - 1 ? Math.max(0, 1 - acc) : b.probability / total;
    acc += p;
    return { ...b, probability: p };
  });
}

// -------------------------------------------------------------
// Curvature Calculation
// -------------------------------------------------------------

export function deriveIdentityCurvature(
  branches: QuantumBranch[]
): number {
  const eps = 1e-12;
  return -branches.reduce(
    (sum, b) =>
      sum + (b.probability > 0 ? b.probability * Math.log(b.probability + eps) : 0),
    0
  );
}

// -------------------------------------------------------------
// Overlay Generation
// -------------------------------------------------------------

export async function generateQuantumOverlay(
  classical: Record<string, unknown>,
  seed?: string,
  currentOverlay?: QuantumOverlay | null,
  policy: QuantumCollapsePolicy = "deterministic"
): Promise<QuantumOverlay> {
  const branches = normalizeProbabilities(generateQuantumBranches(classical));

  const overlayState = {
    branches,
    policy,
    seed: seed ?? null,
  };

  const signature = await sha256(overlayState);
  const curvature = deriveIdentityCurvature(branches);

  // lineage: avoid self-reference
  const previous =
    currentOverlay && currentOverlay.signature !== signature
      ? currentOverlay.signature
      : null;

  return {
    branches,
    curvature,
    signature,
    collapsePolicy: policy,
  };
}

// -------------------------------------------------------------
// Collapse (Deterministic / Probabilistic / Governed)
// -------------------------------------------------------------

export function collapseQuantumBranches(
  overlay: QuantumOverlay,
  seed?: number,
  governance?: QuantumGovernanceContext
): QuantumBranch {
  switch (overlay.collapsePolicy) {
    case "deterministic":
      return overlay.branches.reduce((best, b) =>
        b.probability > best.probability ? b : best
      );

    case "probabilistic":
      return probabilisticCollapse(overlay.branches, seed);

    case "governed":
      if (!governance) {
        throw new Error("GOVERNED_COLLAPSE_REQUIRES_GOVERNANCE_CONTEXT");
      }
      return governedCollapse(overlay.branches, governance);

    default:
      throw new Error("UNKNOWN_COLLAPSE_POLICY");
  }
}

// -------------------------------------------------------------
// Probabilistic Collapse
// -------------------------------------------------------------

function probabilisticCollapse(
  branches: QuantumBranch[],
  seed?: number
): QuantumBranch {
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

// -------------------------------------------------------------
// Governed Collapse
// -------------------------------------------------------------

function governedCollapse(
  branches: QuantumBranch[],
  governance: QuantumGovernanceContext
): QuantumBranch {
  if (governance.mode === "strict") {
    // strict mode: highest probability only
    return branches.reduce((best, b) =>
      b.probability > best.probability ? b : best
    );
  }

  if (governance.mode === "advisory") {
    // advisory: weighted random but biased toward highest
    const sorted = [...branches].sort(
      (a, b) => b.probability - a.probability
    );
    const top = sorted[0];
    const rng = seedRandom();
    return rng() < 0.7 ? top : probabilisticCollapse(branches);
  }

  // off mode: pure probabilistic
  return probabilisticCollapse(branches);
}

// -------------------------------------------------------------
// Inference Integration
// -------------------------------------------------------------

export function runInference(input: {
  simulation: Record<string, unknown>;
  quantum: QuantumOverlay;
}) {
  const { simulation, quantum } = input;

  const facts = [
    {
      id: "quantum-curvature",
      kind: "governance",
      payload: quantum.curvature,
    },
  ];

  const hypotheses = [
    {
      id: "quantum-hypothesis",
      facts,
      confidence: quantum.curvature > 0.5 ? 0.9 : 0.4,
    },
  ];

  const recommendations = [
    {
      id: "substrate-adjust",
      target: "substrate",
      payload: { stabilityDelta: quantum.curvature * -0.1 },
    },
  ];

  return {
    facts,
    hypotheses,
    recommendations,
  };
}
