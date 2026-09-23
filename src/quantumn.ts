import type {
  GovernanceContext,
  InferenceArtifacts,
  PortalKernelState,
  QuantumBranch,
  QuantumCollapsePolicy,
  QuantumGovernanceContext,
  QuantumOverlay,
  QuantumSignature,
  SimEvent,
  SimTecTaskState,
  UmbrellaMode,
} from "./types";

export { runInference } from "./inference";
export type { QuantumCollapsePolicy, QuantumOverlay };

export type QuantumSimulationInput = PortalKernelState & Readonly<{
  eventLog: ReadonlyArray<SimEvent>;
  tecTasks: Readonly<Record<string, SimTecTaskState>>;
}>;

export type QuantumGenerationInput = Readonly<{
  classical: QuantumSimulationInput;
  seed: string | number;
  collapsePolicy?: QuantumCollapsePolicy;
  governanceContext?: GovernanceContext;
  governanceMode?: UmbrellaMode;
  inference?: InferenceArtifacts;
}>;

const BRANCH_NAMES: ReadonlyArray<string> = ["classical", "expansion", "convergence"];

export const QUANTUM_STATE_KEY = "quantum-state";

export function generateQuantumOverlay(input: QuantumGenerationInput): QuantumOverlay {
  const governance: QuantumGovernanceContext | undefined = input.governanceMode === "off" ||
    input.governanceMode === "advisory"
    ? undefined
    : quantumGovernanceFromContext(input.governanceContext ?? {});
  const rawCurvature: Readonly<Record<string, number>> = deriveIdentityCurvature(
    input.classical,
    input.inference,
  );
  const curvature: Readonly<Record<string, number>> = limitCurvature(
    rawCurvature,
    governance?.curvatureLimit,
  );
  const policy: QuantumCollapsePolicy = governance === undefined
    ? input.collapsePolicy ?? "deterministic"
    : "governed";
  const generated: ReadonlyArray<QuantumBranch> = generateQuantumBranches(
    input.classical,
    curvature,
    input.seed,
  );
  const branches: ReadonlyArray<QuantumBranch> = applyProbabilityBias(
    generated,
    governance?.probabilityBias,
  );
  const selected: QuantumBranch = collapseQuantumBranches(
    branches,
    policy,
    input.seed,
    governance,
    input.governanceMode ?? "strict",
  );
  const seedHash: string = hashHex(String(input.seed));
  const average: number = averageCurvature(curvature);
  const signatures: ReadonlyArray<QuantumSignature> = branches.map(
    (branch: QuantumBranch): QuantumSignature => deepFreeze({
      id: branch.signature,
      curvature: average,
      influence: structuredClone(curvature),
    }),
  );
  return deepFreeze({
    state: {
      id: `quantum:${input.classical.tick}:${seedHash}`,
      branches,
      collapsePolicy: policy,
      meta: {
        tick: input.classical.tick,
        seedHash,
        selectedBranchId: selected.id,
        reconciliation: "classical-state-plus-selected-delta",
        governed: governance !== undefined,
      },
    },
    curvature,
    signatures,
    selectedBranchId: selected.id,
  });
}

export function generateQuantumBranches(
  classical: Pick<PortalKernelState, "tick" | "substrate">,
  curvature: Readonly<Record<string, number>>,
  seed: string | number,
): ReadonlyArray<QuantumBranch> {
  const average: number = averageCurvature(curvature);
  const weights: ReadonlyArray<number> = [
    0.4,
    Math.max(0.05, 0.3 + average * 0.15),
    Math.max(0.05, 0.3 - average * 0.15),
  ];
  const probabilities: ReadonlyArray<number> = normalizeProbabilities(weights);
  const magnitude: number = round(Math.max(1, Math.abs(average) * 5));
  const deltas: ReadonlyArray<Readonly<Record<string, unknown>>> = [
    {},
    {
      substrate: {
        stabilityShift: -magnitude,
        anomalyProbability: round(Math.min(1, 0.1 + Math.max(0, average) * 0.1)),
        topologyBifurcation: true,
        resourceEnvelope: "expand",
      },
    },
    {
      substrate: {
        stabilityShift: magnitude,
        anomalyProbability: round(Math.max(0, 0.1 - Math.max(0, -average) * 0.05)),
        topologyBifurcation: false,
        resourceEnvelope: "contract",
      },
    },
  ];
  return deepFreeze(BRANCH_NAMES.map((name: string, index: number): QuantumBranch => {
    const id: string = `branch:${classical.tick}:${name}`;
    return {
      id,
      probability: probabilities[index]!,
      stateDelta: deltas[index]!,
      signature: `MAX-${hashHex(`${String(seed)}:${id}:${classical.substrate.stability}`)}`,
    };
  }));
}

export function normalizeProbabilities(
  weights: ReadonlyArray<number>,
): ReadonlyArray<number> {
  if (weights.length === 0) return [];
  const safe: ReadonlyArray<number> = weights.map((weight: number): number =>
    Number.isFinite(weight) && weight > 0 ? weight : 0,
  );
  const total: number = safe.reduce((sum: number, weight: number): number => sum + weight, 0);
  const source: ReadonlyArray<number> = total > 0 ? safe : safe.map((): number => 1);
  const divisor: number = total > 0 ? total : source.length;
  const normalized: number[] = [];
  let allocated = 0;
  for (let index = 0; index < source.length; index += 1) {
    const probability: number = index === source.length - 1
      ? round(1 - allocated)
      : round(source[index]! / divisor);
    normalized.push(probability);
    allocated = round(allocated + probability);
  }
  return deepFreeze(normalized);
}

export function deriveIdentityCurvature(
  simulation: QuantumSimulationInput,
  inference?: InferenceArtifacts,
): Readonly<Record<string, number>> {
  const identities: Set<string> = new Set<string>();
  for (const agent of Object.values(simulation.agents)) identities.add(agent.identityId);
  for (const window of Object.values(simulation.windows)) identities.add(window.ownerIdentityId);
  for (const task of Object.values(simulation.tecTasks)) identities.add(task.identityId);
  for (const event of simulation.eventLog) {
    if (event.identityId !== undefined) identities.add(event.identityId);
  }

  const governanceInteractions: number = inference?.facts.filter(
    (fact): boolean => fact.kind === "governance",
  ).length ?? 0;
  const curvature: Record<string, number> = {};
  for (const identity of [...identities].sort(compareOrdinal)) {
    const timeline: ReadonlyArray<SimEvent> = simulation.eventLog.filter(
      (event: SimEvent): boolean => event.identityId === identity,
    ).sort((left: SimEvent, right: SimEvent): number =>
      left.at - right.at || compareOrdinal(left.id, right.id),
    );
    const span: number = timeline.length < 2
      ? 1
      : Math.max(1, timeline.at(-1)!.at - timeline[0]!.at + 1);
    const density: number = timeline.length / span;
    const hypothesisInfluence: number = inference?.hypotheses.filter(
      (hypothesis): boolean =>
        hypothesis.description.includes(identity) || hypothesis.tags.includes("recurring-behavior"),
    ).length ?? 0;
    curvature[identity] = round(
      density * 0.5 + timeline.length * 0.1 + governanceInteractions * 0.02 + hypothesisInfluence * 0.05,
    );
  }
  return deepFreeze(curvature);
}

export function collapseQuantumBranches(
  branches: ReadonlyArray<QuantumBranch>,
  policy: QuantumCollapsePolicy,
  seed: string | number,
  governance?: QuantumGovernanceContext,
  governanceMode: UmbrellaMode = "strict",
): QuantumBranch {
  if (branches.length === 0) throw new Error("Quantum collapse requires at least one branch");
  const governed: ReadonlyArray<QuantumBranch> = governance === undefined
    ? branches
    : branches.filter((branch: QuantumBranch): boolean =>
        governance.allowedBranches.includes(branch.id),
      );
  if (governed.length === 0) throw new Error("Umbrella governance denied all quantum branches");

  if (policy === "governed" && governance?.forcedCollapse !== undefined) {
    const forced: QuantumBranch | undefined = governed.find(
      (branch: QuantumBranch): boolean => branch.id === governance.forcedCollapse,
    );
    if (forced !== undefined) return forced;
    if (governanceMode === "strict") {
      throw new Error("Umbrella forced collapse references a denied or unknown branch");
    }
  }
  if (policy !== "probabilistic") return highestProbability(governed);

  const normalized: ReadonlyArray<number> = normalizeProbabilities(
    governed.map((branch: QuantumBranch): number => branch.probability),
  );
  const point: number = seededUnitInterval(seed);
  let cumulative = 0;
  for (let index = 0; index < governed.length; index += 1) {
    cumulative += normalized[index]!;
    if (point < cumulative || index === governed.length - 1) return governed[index]!;
  }
  return governed.at(-1)!;
}

export function quantumGovernanceFromContext(
  context: Readonly<Record<string, unknown>>,
): QuantumGovernanceContext | undefined {
  const value: unknown = context.quantum;
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const record: Readonly<Record<string, unknown>> = value as Readonly<Record<string, unknown>>;
  if (!Array.isArray(record.allowedBranches) || !record.allowedBranches.every(isString)) {
    return undefined;
  }
  if (record.forcedCollapse !== undefined && !isString(record.forcedCollapse)) return undefined;
  if (record.curvatureLimit !== undefined && !finiteNonNegative(record.curvatureLimit)) {
    return undefined;
  }
  const forcedCollapse: string | undefined = isString(record.forcedCollapse)
    ? record.forcedCollapse
    : undefined;
  const curvatureLimit: number | undefined = finiteNonNegative(record.curvatureLimit)
    ? record.curvatureLimit
    : undefined;
  const probabilityBias: Readonly<Record<string, number>> | undefined = numberRecord(
    record.probabilityBias,
  );
  if (record.probabilityBias !== undefined && probabilityBias === undefined) return undefined;
  return deepFreeze({
    allowedBranches: [...record.allowedBranches].sort(compareOrdinal),
    ...(forcedCollapse === undefined ? {} : { forcedCollapse }),
    ...(curvatureLimit === undefined ? {} : { curvatureLimit }),
    ...(probabilityBias === undefined ? {} : { probabilityBias }),
  });
}

function applyProbabilityBias(
  branches: ReadonlyArray<QuantumBranch>,
  bias?: Readonly<Record<string, number>>,
): ReadonlyArray<QuantumBranch> {
  if (bias === undefined) return branches;
  const probabilities: ReadonlyArray<number> = normalizeProbabilities(
    branches.map((branch: QuantumBranch): number =>
      branch.probability * Math.max(0, bias[branch.id] ?? 1),
    ),
  );
  return deepFreeze(branches.map((branch: QuantumBranch, index: number): QuantumBranch => ({
    ...branch,
    probability: probabilities[index]!,
  })));
}

function limitCurvature(
  curvature: Readonly<Record<string, number>>,
  limit?: number,
): Readonly<Record<string, number>> {
  if (limit === undefined) return curvature;
  return deepFreeze(Object.fromEntries(Object.entries(curvature).map(
    ([identity, value]): readonly [string, number] => [
      identity,
      round(Math.max(-limit, Math.min(limit, value))),
    ],
  )));
}

function highestProbability(branches: ReadonlyArray<QuantumBranch>): QuantumBranch {
  return [...branches].sort((left: QuantumBranch, right: QuantumBranch): number =>
    right.probability - left.probability || compareOrdinal(left.id, right.id),
  )[0]!;
}

function averageCurvature(curvature: Readonly<Record<string, number>>): number {
  const values: ReadonlyArray<number> = Object.values(curvature);
  return values.length === 0
    ? 0
    : round(values.reduce((sum: number, value: number): number => sum + value, 0) / values.length);
}

function seededUnitInterval(seed: string | number): number {
  return parseInt(hashHex(String(seed)), 16) / 0x1_0000_0000;
}

function hashHex(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function numberRecord(value: unknown): Readonly<Record<string, number>> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  const entries: ReadonlyArray<readonly [string, unknown]> = Object.entries(value);
  if (!entries.every(([, item]): boolean => finiteNonNegative(item))) return undefined;
  return Object.fromEntries([...entries].sort(
    ([left]: readonly [string, unknown], [right]: readonly [string, unknown]): number =>
      compareOrdinal(left, right),
  )) as Record<string, number>;
}

function finiteNonNegative(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function round(value: number): number {
  return Math.round(value * 1_000_000_000_000) / 1_000_000_000_000;
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
