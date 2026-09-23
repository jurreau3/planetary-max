import type {
  EpistemicEvent,
  EpistemicTimeline,
  InstituteCanon,
  InstituteInferenceFact,
  InstituteQuantumBranch,
  InstituteSimulationDelta,
  InstituteState,
  InstituteTruth,
  InstituteTruthFormation,
} from "./types";

export const MIN_INSTITUTE_PATTERN_TICKS = 2;
export const MIN_INSTITUTE_STABILITY = 0.6;

export type InstituteFormationResult = Readonly<{
  state: InstituteState;
  truth: InstituteTruth;
  event: EpistemicEvent;
}>;

export type InstituteFormationFailure = Readonly<{
  code: "INVALID_INSTITUTE_EVIDENCE" | "UNSTABLE_INSTITUTE_PATTERN";
  message: string;
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
  if (!nonEmptyString(payload.id) || !nonEmptyString(payload.description)) {
    return invalidEvidence("Institute truth id and description are required");
  }
  if (!nonNegativeInteger(payload.at)) {
    return invalidEvidence("Institute truth at must be a non-negative integer");
  }
  if (!Array.isArray(payload.facts) || payload.facts.length === 0) {
    return invalidEvidence("Institute truth requires inference facts");
  }
  if (!Array.isArray(payload.quantumBranches) || payload.quantumBranches.length === 0) {
    return invalidEvidence("Institute truth requires quantum branches");
  }
  if (!Array.isArray(payload.simulationDeltas) || payload.simulationDeltas.length === 0) {
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
      !finiteNumber(value.curvature)
    ) {
      return invalidEvidence("Institute quantum branches are invalid");
    }
    quantumBranches.push({
      factId: value.factId,
      probability: value.probability,
      curvature: value.curvature,
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
    quantumBranches,
    simulationDeltas,
    at: payload.at,
  });
}

export function formInstituteTruth(
  current: InstituteState,
  formation: InstituteTruthFormation,
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
  const quantumSupport: number = average(
    formation.quantumBranches.map((branch: InstituteQuantumBranch): number => branch.probability),
  );
  const persistenceSupport: number = Math.min(1, persistence / (MIN_INSTITUTE_PATTERN_TICKS + 1));
  const stability: number = boundedPrecision(
    average([inferenceSupport, quantumSupport, persistenceSupport]),
    0,
    1,
  );
  if (stability < MIN_INSTITUTE_STABILITY) {
    return unstablePattern("Institute evidence does not meet the stability threshold");
  }

  const curvature: number = weightedCurvature(formation.quantumBranches);
  const previous: InstituteTruth | undefined = current.canon.truths[formation.id];
  const truth: InstituteTruth = deepFreeze({
    id: formation.id,
    description: formation.description,
    sourceFacts,
    stability,
    curvature,
    createdAt: previous?.createdAt ?? formation.at,
    updatedAt: formation.at,
  });
  const action: EpistemicEvent["action"] = previous === undefined ? "added" : "updated";
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
