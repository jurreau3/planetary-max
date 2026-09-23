import type {
  EpistemicEvent,
  EpistemicTimeline,
  InstituteCanon,
  InstituteInferenceFact,
  InstituteInferenceHypothesis,
  InstituteQuantumBranch,
  InstituteSimulationDelta,
  InstituteState,
  InstituteTruth,
  InstituteTruthFormation,
} from "./types";

export const MIN_INSTITUTE_PATTERN_TICKS = 2;
export const MIN_INSTITUTE_STABILITY = 0.6;
export const MIN_INSTITUTE_HYPOTHESIS_CONFIDENCE = 0.5;
const MAX_INSTITUTE_EVIDENCE_ENTRIES = 1_000;
const MAX_INSTITUTE_EVIDENCE_BYTES = 262_144;

export type InstituteFormationResult = Readonly<{
  state: InstituteState;
  truth: InstituteTruth;
  event?: EpistemicEvent;
  changed: boolean;
}>;

export type InstituteFormationFailure = Readonly<{
  code:
    | "INVALID_INSTITUTE_EVIDENCE"
    | "UNSTABLE_INSTITUTE_PATTERN"
    | "INSTITUTE_GOVERNANCE_DENIED";
  message: string;
}>;

export type InstituteTruthGovernance = Readonly<{
  mode: "strict" | "advisory" | "off";
  stabilityThreshold?: number;
  curvatureLimit?: number;
}>;

export function initialInstituteState(): InstituteState {
  return deepFreeze({
    canon: { truths: {}, version: 0, updatedAt: 0 },
    timelines: {},
  });
}

export function parseTruthFormation(
  payload: Readonly<Record<string, unknown>>,
  identityId: string,
): InstituteTruthFormation | InstituteFormationFailure {
  if (!hasSafeKeys(payload)) {
    return invalidEvidence("Institute evidence contains unsafe object keys");
  }
  if (jsonSize(payload) > MAX_INSTITUTE_EVIDENCE_BYTES) {
    return invalidEvidence("Institute evidence exceeds the size limit");
  }
  if (!nonEmptyString(payload.id) || !nonEmptyString(payload.description)) {
    return invalidEvidence("Institute truth id and description are required");
  }
  if (!nonNegativeInteger(payload.at)) {
    return invalidEvidence("Institute truth at must be a non-negative integer");
  }
  if (
    !Array.isArray(payload.facts) || payload.facts.length === 0 ||
    payload.facts.length > MAX_INSTITUTE_EVIDENCE_ENTRIES
  ) {
    return invalidEvidence("Institute truth requires inference facts");
  }
  if (
    !Array.isArray(payload.quantumBranches) || payload.quantumBranches.length === 0 ||
    payload.quantumBranches.length > MAX_INSTITUTE_EVIDENCE_ENTRIES
  ) {
    return invalidEvidence("Institute truth requires quantum branches");
  }
  if (
    !Array.isArray(payload.simulationDeltas) || payload.simulationDeltas.length === 0 ||
    payload.simulationDeltas.length > MAX_INSTITUTE_EVIDENCE_ENTRIES
  ) {
    return invalidEvidence("Institute truth requires simulation deltas");
  }

  const facts: InstituteInferenceFact[] = [];
  const factIds: Set<string> = new Set<string>();
  for (const value of payload.facts) {
    if (
      !isRecord(value) ||
      !nonEmptyString(value.id) ||
      !nonEmptyString(value.description) ||
      !unitInterval(value.confidence) ||
      factIds.has(value.id)
    ) {
      return invalidEvidence("Institute inference facts are invalid or duplicated");
    }
    factIds.add(value.id);
    facts.push({ id: value.id, description: value.description, confidence: value.confidence });
  }

  const quantumBranches: InstituteQuantumBranch[] = [];
  for (const value of payload.quantumBranches) {
    if (
      !isRecord(value) ||
      !nonEmptyString(value.factId) ||
      !factIds.has(value.factId) ||
      !unitInterval(value.probability) ||
      !finiteNumber(value.curvature) ||
      (value.signature !== undefined && !nonEmptyString(value.signature))
    ) {
      return invalidEvidence("Institute quantum branches are invalid");
    }
    quantumBranches.push({
      factId: value.factId,
      probability: value.probability,
      curvature: value.curvature,
      ...(value.signature === undefined ? {} : { signature: value.signature }),
    });
  }

  const hypotheses: InstituteInferenceHypothesis[] = [];
  const hypothesisIds: Set<string> = new Set<string>();
  if (payload.hypotheses !== undefined && !Array.isArray(payload.hypotheses)) {
    return invalidEvidence("Institute hypotheses must be an array");
  }
  if (Array.isArray(payload.hypotheses) && payload.hypotheses.length > MAX_INSTITUTE_EVIDENCE_ENTRIES) {
    return invalidEvidence("Institute hypotheses exceed the entry limit");
  }
  for (const value of Array.isArray(payload.hypotheses) ? payload.hypotheses : []) {
    if (
      !isRecord(value) || !nonEmptyString(value.id) || hypothesisIds.has(value.id) ||
      !Array.isArray(value.factIds) || value.factIds.length === 0 ||
      !value.factIds.every((factId: unknown): factId is string =>
        nonEmptyString(factId) && factIds.has(factId)) ||
      !unitInterval(value.confidence) ||
      (value.curvatureGuidance !== undefined && !finiteNumber(value.curvatureGuidance)) ||
      (value.collapsePolicySuggestion !== undefined &&
        !isCollapsePolicy(value.collapsePolicySuggestion))
    ) {
      return invalidEvidence("Institute inference hypotheses are invalid or duplicated");
    }
    hypothesisIds.add(value.id);
    hypotheses.push({
      id: value.id,
      factIds: [...new Set<string>(value.factIds)].sort(compareOrdinal),
      confidence: value.confidence,
      ...(value.curvatureGuidance === undefined
        ? {}
        : { curvatureGuidance: value.curvatureGuidance }),
      ...(value.collapsePolicySuggestion === undefined
        ? {}
        : { collapsePolicySuggestion: value.collapsePolicySuggestion }),
    });
  }

  const simulationDeltas: InstituteSimulationDelta[] = [];
  for (const value of payload.simulationDeltas) {
    if (
      !isRecord(value) ||
      !nonEmptyString(value.factId) ||
      !factIds.has(value.factId) ||
      !nonNegativeInteger(value.tick)
    ) {
      return invalidEvidence("Institute simulation deltas are invalid");
    }
    simulationDeltas.push({ factId: value.factId, tick: value.tick });
  }

  return deepFreeze({
    id: payload.id,
    description: payload.description,
    identityId,
    facts,
    hypotheses,
    quantumBranches,
    simulationDeltas,
    at: payload.at,
  });
}

export function formInstituteTruth(
  current: InstituteState,
  formation: InstituteTruthFormation,
  governance: InstituteTruthGovernance = { mode: "strict" },
): InstituteFormationResult | InstituteFormationFailure {
  if (formation.at < current.canon.updatedAt) {
    return invalidEvidence("Institute formations cannot precede the current canon");
  }
  const sourceFacts: string[] = formation.facts
    .map((fact: InstituteInferenceFact): string => fact.id)
    .sort(compareOrdinal);
  const persistence: number = minimumPersistence(sourceFacts, formation.simulationDeltas);
  if (persistence < MIN_INSTITUTE_PATTERN_TICKS) {
    return unstablePattern("Institute patterns must persist across simulation ticks");
  }
  if (!sourceFacts.every((factId: string): boolean => hasQuantumSupport(factId, formation.quantumBranches))) {
    return unstablePattern("Every source fact requires quantum branch support");
  }

  const inferenceSupport: number = average(
    formation.facts.map((fact: InstituteInferenceFact): number => fact.confidence),
  );
  const supportedHypotheses: InstituteInferenceHypothesis[] = formation.hypotheses.filter(
    (hypothesis: InstituteInferenceHypothesis): boolean =>
      hypothesis.confidence > MIN_INSTITUTE_HYPOTHESIS_CONFIDENCE,
  );
  if (formation.hypotheses.length > 0 && supportedHypotheses.length === 0) {
    return unstablePattern("Institute hypotheses do not meet the confidence threshold");
  }
  const quantumSupport: number = average(
    formation.quantumBranches.map((branch: InstituteQuantumBranch): number => branch.probability),
  );
  const persistenceSupport: number = Math.min(1, persistence / (MIN_INSTITUTE_PATTERN_TICKS + 1));
  const hypothesisSupport: ReadonlyArray<number> = supportedHypotheses.length === 0
    ? []
    : [average(supportedHypotheses.map((hypothesis): number => hypothesis.confidence))];
  const computedStability: number = boundedPrecision(
    average([inferenceSupport, quantumSupport, persistenceSupport, ...hypothesisSupport]),
    0,
    1,
  );
  const stabilityThreshold: number = governance.stabilityThreshold ?? MIN_INSTITUTE_STABILITY;
  if (!unitInterval(stabilityThreshold)) {
    return invalidEvidence("Institute governance stabilityThreshold must be between zero and one");
  }
  if (computedStability < MIN_INSTITUTE_STABILITY) {
    return unstablePattern("Institute evidence does not meet the stability threshold");
  }

  const previous: InstituteTruth | undefined = current.canon.truths[formation.id];
  const stability: number = Math.max(previous?.stability ?? 0, computedStability);
  const curvatureGuidance: number[] = supportedHypotheses.flatMap(
    (hypothesis: InstituteInferenceHypothesis): number[] =>
      hypothesis.curvatureGuidance === undefined ? [] : [hypothesis.curvatureGuidance],
  );
  const computedCurvature: number = precision(average([
    weightedCurvature(formation.quantumBranches),
    ...(curvatureGuidance.length === 0 ? [] : [average(curvatureGuidance)]),
  ]));
  if (governance.mode === "strict" && stability < stabilityThreshold) {
    return governanceDenied("Umbrella governance denied an unstable Institute truth");
  }
  if (governance.curvatureLimit !== undefined && !finiteNumber(governance.curvatureLimit)) {
    return invalidEvidence("Institute governance curvatureLimit must be finite");
  }
  const curvature: number = governance.mode === "strict" && governance.curvatureLimit !== undefined
    ? Math.min(computedCurvature, governance.curvatureLimit)
    : computedCurvature;
  const truth: InstituteTruth = deepFreeze({
    id: formation.id,
    description: formation.description,
    sourceFacts,
    stability,
    curvature,
    createdAt: previous?.createdAt ?? formation.at,
    updatedAt: formation.at,
  });
  if (previous !== undefined && sameTruth(previous, truth)) {
    return deepFreeze({ state: current, truth: previous, changed: false });
  }
  const action: EpistemicEvent["action"] = previous === undefined ? "added" : "updated";
  const signatures: string[] = [...new Set<string>(
    formation.quantumBranches.flatMap((branch: InstituteQuantumBranch): string[] =>
      branch.signature === undefined ? [] : [branch.signature],
    ),
  )].sort(compareOrdinal);
  const event: EpistemicEvent = deepFreeze({
    id: `${formation.id}:${current.canon.version + 1}:${action}`,
    truthId: formation.id,
    action,
    at: formation.at,
    meta: {
      sourceFacts,
      stability,
      curvature,
      identityId: formation.identityId,
      supportingHypotheses: supportedHypotheses.map((hypothesis): string => hypothesis.id),
      collapsePolicySuggestions: [...new Set<string>(supportedHypotheses.flatMap(
        (hypothesis: InstituteInferenceHypothesis): string[] =>
          hypothesis.collapsePolicySuggestion === undefined
            ? []
            : [hypothesis.collapsePolicySuggestion],
      ))].sort(compareOrdinal),
      governance: {
        mode: governance.mode,
        decision: governance.mode === "advisory" ? "advisory" : "allowed",
        stabilityThreshold,
        curvatureLimited: curvature !== computedCurvature,
      },
      signatureOverlays: signatures,
    },
  });
  const timeline: EpistemicTimeline = current.timelines[formation.identityId] ?? {
    identityId: formation.identityId,
    events: [],
  };
  const canon: InstituteCanon = {
    truths: { ...current.canon.truths, [truth.id]: truth },
    version: current.canon.version + 1,
    updatedAt: formation.at,
  };
  return deepFreeze({
    truth,
    event,
    changed: true,
    state: {
      canon,
      timelines: {
        ...current.timelines,
        [formation.identityId]: {
          identityId: formation.identityId,
          events: [...timeline.events, event],
        },
      },
    },
  });
}

function sameTruth(previous: InstituteTruth, next: InstituteTruth): boolean {
  return (
    previous.description === next.description &&
    previous.stability === next.stability &&
    previous.curvature === next.curvature &&
    previous.sourceFacts.length === next.sourceFacts.length &&
    previous.sourceFacts.every((factId: string, index: number): boolean => factId === next.sourceFacts[index])
  );
}

export function isInstituteFormationFailure(
  value: InstituteFormationResult | InstituteFormationFailure,
): value is InstituteFormationFailure {
  return "code" in value;
}

function minimumPersistence(
  factIds: ReadonlyArray<string>,
  deltas: ReadonlyArray<InstituteSimulationDelta>,
): number {
  return Math.min(
    ...factIds.map((factId: string): number =>
      new Set<number>(
        deltas
          .filter((delta: InstituteSimulationDelta): boolean => delta.factId === factId)
          .map((delta: InstituteSimulationDelta): number => delta.tick),
      ).size,
    ),
  );
}

function hasQuantumSupport(
  factId: string,
  branches: ReadonlyArray<InstituteQuantumBranch>,
): boolean {
  return branches.some((branch: InstituteQuantumBranch): boolean => branch.factId === factId);
}

function weightedCurvature(branches: ReadonlyArray<InstituteQuantumBranch>): number {
  const totalProbability: number = branches.reduce(
    (total: number, branch: InstituteQuantumBranch): number => total + branch.probability,
    0,
  );
  if (totalProbability === 0) return 0;
  const weighted: number = branches.reduce(
    (total: number, branch: InstituteQuantumBranch): number =>
      total + branch.curvature * branch.probability,
    0,
  );
  return precision(weighted / totalProbability);
}

function average(values: ReadonlyArray<number>): number {
  return values.reduce((total: number, value: number): number => total + value, 0) / values.length;
}

function boundedPrecision(value: number, minimum: number, maximum: number): number {
  return precision(Math.max(minimum, Math.min(maximum, value)));
}

function precision(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function invalidEvidence(message: string): InstituteFormationFailure {
  return { code: "INVALID_INSTITUTE_EVIDENCE", message };
}

function unstablePattern(message: string): InstituteFormationFailure {
  return { code: "UNSTABLE_INSTITUTE_PATTERN", message };
}

function governanceDenied(message: string): InstituteFormationFailure {
  return { code: "INSTITUTE_GOVERNANCE_DENIED", message };
}

function nonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function finiteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function unitInterval(value: unknown): value is number {
  return finiteNumber(value) && value >= 0 && value <= 1;
}

function nonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function isCollapsePolicy(
  value: unknown,
): value is NonNullable<InstituteInferenceHypothesis["collapsePolicySuggestion"]> {
  return value === "deterministic" || value === "probabilistic" || value === "governed";
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function jsonSize(value: unknown): number {
  try {
    return new TextEncoder().encode(JSON.stringify(value)).byteLength;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
}

function hasSafeKeys(value: unknown): boolean {
  if (Array.isArray(value)) return value.every((entry: unknown): boolean => hasSafeKeys(entry));
  if (!isRecord(value)) return true;
  for (const [key, nested] of Object.entries(value)) {
    if (key === "__proto__" || key === "prototype" || key === "constructor") return false;
    if (!hasSafeKeys(nested)) return false;
  }
  return true;
}
