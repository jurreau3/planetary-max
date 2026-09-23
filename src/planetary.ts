import { MIN_INSTITUTE_STABILITY } from "./institute";
import type {
  EpistemicEvent,
  EpistemicTimeline,
  InstituteCanon,
  InstituteTruth,
  PlanetaryAnomaly,
  PlanetaryCanon,
  PlanetaryGovernanceContext,
  PlanetaryIdentity,
  PlanetaryNodeSnapshot,
  PlanetaryQuantumState,
  PlanetaryState,
  PlanetarySubstrate,
  PlanetarySynchronization,
  QuantumBranch,
} from "./types";

export type PlanetaryFailure = Readonly<{
  code: "INVALID_PLANETARY_STATE" | "PLANETARY_GOVERNANCE_DENIED";
  message: string;
}>;

const MAX_PLANETARY_NODES = 100;
const MAX_PLANETARY_ENTITIES_PER_NODE = 1_000;
const MAX_PLANETARY_INPUT_BYTES = 1_000_000;

export function initialPlanetaryState(): PlanetaryState {
  return deepFreeze({
    identities: {},
    substrates: {},
    quantum: {
      branches: [],
      globalCurvature: 0,
      globalSignature: "",
      collapsePolicy: "deterministic",
    },
    canon: { truths: {}, version: 0, updatedAt: 0, globalStability: 0 },
    governance: { mode: "strict", nodePolicies: {}, globalTruthRules: {}, collapseRules: {} },
    coordinatorIdentity: "",
    synchronizedAt: 0,
    advisories: [],
  });
}

export function parsePlanetarySynchronization(
  payload: Readonly<Record<string, unknown>>,
  coordinatorIdentity: string,
): PlanetarySynchronization | PlanetaryFailure {
  if (!hasSafeKeys(payload)) return invalid("Planetary synchronization contains unsafe object keys");
  if (jsonSize(payload) > MAX_PLANETARY_INPUT_BYTES) {
    return invalid("Planetary synchronization exceeds the size limit");
  }
  if (!nonNegativeInteger(payload.at)) return invalid("Planetary synchronization at is invalid");
  if (
    !Array.isArray(payload.nodes) ||
    payload.nodes.length === 0 ||
    payload.nodes.length > MAX_PLANETARY_NODES
  ) {
    return invalid("Planetary synchronization requires node snapshots");
  }
  if (!isRecord(payload.governance)) return invalid("Planetary governance context is required");
  const governance: PlanetaryGovernanceContext | null = parseGovernance(payload.governance);
  if (governance === null) return invalid("Planetary governance context is invalid");
  if (!isCollapsePolicy(payload.collapsePolicy)) {
    return invalid("Planetary collapse policy is invalid");
  }

  const nodes: PlanetaryNodeSnapshot[] = [];
  const nodeIds: Set<string> = new Set<string>();
  for (const value of payload.nodes) {
    const node: PlanetaryNodeSnapshot | null = parseNode(value);
    if (node === null || nodeIds.has(node.nodeId)) {
      return invalid("Planetary node snapshots are invalid or duplicated");
    }
    nodeIds.add(node.nodeId);
    nodes.push(node);
  }
  return deepFreeze({
    at: payload.at,
    coordinatorIdentity,
    nodes: nodes.sort((left, right): number => compareOrdinal(left.nodeId, right.nodeId)),
    governance,
    collapsePolicy: payload.collapsePolicy,
  });
}

export function synchronizePlanetaryState(
  synchronization: PlanetarySynchronization,
): PlanetaryState | PlanetaryFailure {
  const advisories: string[] = [];
  const activeNodes: PlanetaryNodeSnapshot[] = synchronization.nodes.filter(
    (node: PlanetaryNodeSnapshot): boolean => {
      const disabled: boolean = nodePolicy(node.nodeId, synchronization.governance).enabled === false;
      if (!disabled || synchronization.governance.mode === "off") return true;
      if (synchronization.governance.mode === "advisory") {
        advisories.push(`node:${node.nodeId}:disabled-by-global-policy`);
        return true;
      }
      return false;
    },
  );
  if (activeNodes.length === 0) {
    return denied("Planetary governance disabled every node");
  }

  const identities: Record<string, PlanetaryIdentity> = {};
  const identityIds: string[] = uniqueSorted(
    activeNodes.flatMap((node: PlanetaryNodeSnapshot): string[] =>
      node.identities.map((identity: PlanetaryIdentity): string => identity.id),
    ),
  );
  for (const identityId of identityIds) {
    const replicas: PlanetaryIdentity[] = activeNodes
      .flatMap((node: PlanetaryNodeSnapshot): ReadonlyArray<PlanetaryIdentity> => node.identities)
      .filter((identity: PlanetaryIdentity): boolean => identity.id === identityId);
    if (replicas.length !== activeNodes.length) {
      if (synchronization.governance.mode === "strict") {
        return denied(`Planetary identity ${identityId} did not propagate to every node`);
      }
      if (synchronization.governance.mode === "advisory") {
        advisories.push(`identity:${identityId}:incomplete-propagation`);
      }
    }
    const signatures: string[] = uniqueSorted(replicas.map((replica): string => replica.signature));
    const origins: string[] = uniqueSorted(replicas.map((replica): string => replica.originNode));
    if (synchronization.governance.mode === "strict" && (signatures.length !== 1 || origins.length !== 1)) {
      return denied(`Planetary identity ${identityId} has divergent signatures or origins`);
    }
    if (
      synchronization.governance.mode === "advisory" &&
      (signatures.length !== 1 || origins.length !== 1)
    ) {
      advisories.push(`identity:${identityId}:replica-divergence`);
    }
    const timeline: EpistemicTimeline | PlanetaryFailure = mergeTimeline(
      identityId,
      replicas,
      synchronization.governance,
      advisories,
    );
    if (isPlanetaryFailure(timeline)) return timeline;
    identities[identityId] = {
      id: identityId,
      originNode: origins[0] ?? "",
      timeline,
      curvature: precision(average(replicas.map((replica): number => replica.curvature))),
      signature: signatures[0] ?? "",
    };
  }

  const substrates: Record<string, PlanetarySubstrate> = {};
  const substrateIds: string[] = uniqueSorted(
    activeNodes.flatMap((node): string[] => node.substrates.map((substrate): string => substrate.id)),
  );
  for (const substrateId of substrateIds) {
    const replicas: ReadonlyArray<Readonly<{ nodeId: string; substrate: PlanetarySubstrate }>> =
      activeNodes.flatMap((node: PlanetaryNodeSnapshot) =>
        node.substrates
          .filter((substrate: PlanetarySubstrate): boolean => substrate.id === substrateId)
          .map((substrate: PlanetarySubstrate) => ({ nodeId: node.nodeId, substrate })),
      );
    const topology: Record<string, unknown> = {};
    for (const replica of replicas) topology[replica.nodeId] = structuredClone(replica.substrate.topology);
    const anomalies: PlanetaryAnomaly[] = mergeAnomalies(
      replicas.flatMap((replica): ReadonlyArray<PlanetaryAnomaly> => replica.substrate.anomalies),
    );
    substrates[substrateId] = {
      id: substrateId,
      nodes: uniqueSorted(replicas.flatMap((replica): ReadonlyArray<string> => [
        replica.nodeId,
        ...replica.substrate.nodes,
      ])),
      topology,
      stability: precision(average(replicas.map((replica): number => replica.substrate.stability))),
      anomalies,
    };
  }

  const branches: QuantumBranch[] = governedBranches(activeNodes, synchronization.governance, advisories);
  const quantum: PlanetaryQuantumState = collapseQuantum(branches, synchronization.collapsePolicy);
  const canon: PlanetaryCanon = formPlanetaryCanon(
    activeNodes,
    synchronization.governance,
    advisories,
  );
  return deepFreeze({
    identities,
    substrates,
    quantum,
    canon,
    governance: synchronization.governance,
    coordinatorIdentity: synchronization.coordinatorIdentity,
    synchronizedAt: synchronization.at,
    advisories: uniqueSorted(advisories),
  });
}

export function isPlanetaryFailure(value: unknown): value is PlanetaryFailure {
  return isRecord(value) &&
    (value.code === "INVALID_PLANETARY_STATE" || value.code === "PLANETARY_GOVERNANCE_DENIED") &&
    typeof value.message === "string";
}

function parseGovernance(value: Record<string, unknown>): PlanetaryGovernanceContext | null {
  if (
    !isMode(value.mode) ||
    !isRecord(value.nodePolicies) ||
    !isRecord(value.globalTruthRules) ||
    !isRecord(value.collapseRules) ||
    (value.globalTruthRules.minStability !== undefined &&
      !unitInterval(value.globalTruthRules.minStability)) ||
    (value.collapseRules.deniedSignatures !== undefined &&
      (!Array.isArray(value.collapseRules.deniedSignatures) ||
        !value.collapseRules.deniedSignatures.every(nonEmptyString)))
  ) return null;
  return {
    mode: value.mode,
    nodePolicies: structuredClone(value.nodePolicies),
    globalTruthRules: structuredClone(value.globalTruthRules),
    collapseRules: structuredClone(value.collapseRules),
  };
}

function parseNode(value: unknown): PlanetaryNodeSnapshot | null {
  if (
    !isRecord(value) ||
    !nonEmptyString(value.nodeId) ||
    !Array.isArray(value.identities) ||
    !Array.isArray(value.substrates) ||
    !Array.isArray(value.quantumBranches) ||
    !isRecord(value.canon) ||
    !isRecord(value.truthSignatures) ||
    value.identities.length > MAX_PLANETARY_ENTITIES_PER_NODE ||
    value.substrates.length > MAX_PLANETARY_ENTITIES_PER_NODE ||
    value.quantumBranches.length > MAX_PLANETARY_ENTITIES_PER_NODE
  ) return null;
  const identities: PlanetaryIdentity[] = [];
  const identityIds: Set<string> = new Set<string>();
  for (const identityValue of value.identities) {
    const identity: PlanetaryIdentity | null = parseIdentity(identityValue);
    if (identity === null || identityIds.has(identity.id)) return null;
    identityIds.add(identity.id);
    identities.push(identity);
  }
  const substrates: PlanetarySubstrate[] = [];
  const substrateIds: Set<string> = new Set<string>();
  for (const substrateValue of value.substrates) {
    const substrate: PlanetarySubstrate | null = parseSubstrate(substrateValue);
    if (substrate === null || substrateIds.has(substrate.id)) return null;
    substrateIds.add(substrate.id);
    substrates.push(substrate);
  }
  const quantumBranches: QuantumBranch[] = [];
  const branchIds: Set<string> = new Set<string>();
  for (const branchValue of value.quantumBranches) {
    const branch: QuantumBranch | null = parseBranch(branchValue, value.nodeId);
    if (branch === null || branchIds.has(branch.id)) return null;
    branchIds.add(branch.id);
    quantumBranches.push(branch);
  }
  const canon: InstituteCanon | null = parseCanon(value.canon);
  if (canon === null) return null;
  const truthSignatures: Record<string, string> = {};
  for (const [truthId, signature] of Object.entries(value.truthSignatures)) {
    if (!nonEmptyString(signature)) return null;
    truthSignatures[truthId] = signature;
  }
  return deepFreeze({
    nodeId: value.nodeId,
    identities,
    substrates,
    quantumBranches,
    canon,
    truthSignatures,
  });
}

function parseIdentity(value: unknown): PlanetaryIdentity | null {
  if (
    !isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.originNode) ||
    !finiteNumber(value.curvature) || !nonEmptyString(value.signature) || !isRecord(value.timeline) ||
    value.timeline.identityId !== value.id || !Array.isArray(value.timeline.events) ||
    value.timeline.events.length > MAX_PLANETARY_ENTITIES_PER_NODE
  ) return null;
  const events: EpistemicEvent[] = [];
  for (const eventValue of value.timeline.events) {
    if (
      !isRecord(eventValue) || !nonEmptyString(eventValue.id) || !nonEmptyString(eventValue.truthId) ||
      !isEventAction(eventValue.action) || !nonNegativeInteger(eventValue.at) || !isRecord(eventValue.meta)
    ) return null;
    events.push({
      id: eventValue.id,
      truthId: eventValue.truthId,
      action: eventValue.action,
      at: eventValue.at,
      meta: structuredClone(eventValue.meta),
    });
  }
  return deepFreeze({
    id: value.id,
    originNode: value.originNode,
    curvature: value.curvature,
    signature: value.signature,
    timeline: { identityId: value.id, events },
  });
}

function parseSubstrate(value: unknown): PlanetarySubstrate | null {
  if (
    !isRecord(value) || !nonEmptyString(value.id) || !Array.isArray(value.nodes) ||
    !value.nodes.every(nonEmptyString) || !isRecord(value.topology) || !unitInterval(value.stability) ||
    !Array.isArray(value.anomalies) || value.anomalies.length > MAX_PLANETARY_ENTITIES_PER_NODE
  ) return null;
  const anomalies: PlanetaryAnomaly[] = [];
  for (const anomalyValue of value.anomalies) {
    if (
      !isRecord(anomalyValue) || !nonEmptyString(anomalyValue.id) || !nonEmptyString(anomalyValue.node) ||
      !finiteNumber(anomalyValue.magnitude) || anomalyValue.magnitude < 0 ||
      !nonEmptyString(anomalyValue.signature) || !nonNegativeInteger(anomalyValue.at)
    ) return null;
    anomalies.push({
      id: anomalyValue.id,
      node: anomalyValue.node,
      magnitude: anomalyValue.magnitude,
      signature: anomalyValue.signature,
      at: anomalyValue.at,
    });
  }
  return deepFreeze({
    id: value.id,
    nodes: uniqueSorted(value.nodes),
    topology: structuredClone(value.topology),
    stability: value.stability,
    anomalies,
  });
}

function parseBranch(value: unknown, nodeId: string): QuantumBranch | null {
  if (
    !isRecord(value) || !nonEmptyString(value.id) || !unitInterval(value.probability) ||
    !isRecord(value.stateDelta) || !nonEmptyString(value.signature) ||
    (value.stateDelta.node !== undefined && value.stateDelta.node !== nodeId) ||
    (value.stateDelta.curvature !== undefined && !finiteNumber(value.stateDelta.curvature))
  ) return null;
  return deepFreeze({
    id: value.id,
    probability: value.probability,
    stateDelta: structuredClone(value.stateDelta),
    signature: value.signature,
  });
}

function parseCanon(value: Record<string, unknown>): InstituteCanon | null {
  if (
    !isRecord(value.truths) || Object.keys(value.truths).length > MAX_PLANETARY_ENTITIES_PER_NODE ||
    !nonNegativeInteger(value.version) || !nonNegativeInteger(value.updatedAt)
  ) {
    return null;
  }
  const truths: Record<string, InstituteTruth> = {};
  for (const [id, truthValue] of Object.entries(value.truths)) {
    const truth: InstituteTruth | null = parseTruth(truthValue);
    if (truth === null || truth.id !== id) return null;
    truths[id] = truth;
  }
  return deepFreeze({ truths, version: value.version, updatedAt: value.updatedAt });
}

function parseTruth(value: unknown): InstituteTruth | null {
  if (
    !isRecord(value) || !nonEmptyString(value.id) || !nonEmptyString(value.description) ||
    !Array.isArray(value.sourceFacts) || !value.sourceFacts.every(nonEmptyString) ||
    !unitInterval(value.stability) || !finiteNumber(value.curvature) ||
    !nonNegativeInteger(value.createdAt) || !nonNegativeInteger(value.updatedAt)
  ) return null;
  return deepFreeze({
    id: value.id,
    description: value.description,
    sourceFacts: uniqueSorted(value.sourceFacts),
    stability: value.stability,
    curvature: value.curvature,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  });
}

function mergeTimeline(
  identityId: string,
  replicas: ReadonlyArray<PlanetaryIdentity>,
  governance: PlanetaryGovernanceContext,
  advisories: string[],
): EpistemicTimeline | PlanetaryFailure {
  const events: Map<string, EpistemicEvent> = new Map<string, EpistemicEvent>();
  for (const replica of replicas) {
    for (const event of replica.timeline.events) {
      const existing: EpistemicEvent | undefined = events.get(event.id);
      if (existing !== undefined && stableJson(existing) !== stableJson(event)) {
        if (governance.mode === "strict") {
          return denied(`Epistemic event ${event.id} diverged across identity replicas`);
        }
        if (governance.mode === "advisory") {
          advisories.push(`identity:${identityId}:event:${event.id}:divergence`);
        }
        events.set(event.id, stableJson(existing) < stableJson(event) ? existing : event);
        continue;
      }
      events.set(event.id, event);
    }
  }
  return {
    identityId,
    events: [...events.values()].sort(
      (left: EpistemicEvent, right: EpistemicEvent): number =>
        left.at - right.at || compareOrdinal(left.id, right.id),
    ),
  };
}

function mergeAnomalies(values: ReadonlyArray<PlanetaryAnomaly>): PlanetaryAnomaly[] {
  const anomalies: Map<string, PlanetaryAnomaly> = new Map<string, PlanetaryAnomaly>();
  for (const anomaly of [...values].sort((left, right): number => compareOrdinal(stableJson(left), stableJson(right)))) {
    if (!anomalies.has(anomaly.id)) anomalies.set(anomaly.id, anomaly);
  }
  return [...anomalies.values()].sort(
    (left, right): number => left.at - right.at || compareOrdinal(left.id, right.id),
  );
}

function governedBranches(
  nodes: ReadonlyArray<PlanetaryNodeSnapshot>,
  governance: PlanetaryGovernanceContext,
  advisories: string[],
): QuantumBranch[] {
  const deniedSignatures: ReadonlySet<string> = new Set<string>(
    stringArray(governance.collapseRules.deniedSignatures),
  );
  const branches: QuantumBranch[] = [];
  for (const branch of nodes.flatMap((node): ReadonlyArray<QuantumBranch> => node.quantumBranches)) {
    if (!deniedSignatures.has(branch.signature) || governance.mode === "off") {
      branches.push(branch);
    } else if (governance.mode === "advisory") {
      advisories.push(`quantum:${branch.id}:unsafe-signature`);
      branches.push(branch);
    }
  }
  return branches.sort(
    (left, right): number => compareOrdinal(left.signature, right.signature) ||
      compareOrdinal(branchNode(left), branchNode(right)) || compareOrdinal(left.id, right.id),
  );
}

function collapseQuantum(
  values: ReadonlyArray<QuantumBranch>,
  collapsePolicy: PlanetaryQuantumState["collapsePolicy"],
): PlanetaryQuantumState {
  const groups: Map<string, QuantumBranch[]> = new Map<string, QuantumBranch[]>();
  for (const branch of values) groups.set(branch.signature, [...(groups.get(branch.signature) ?? []), branch]);
  const totals: ReadonlyArray<Readonly<{ signature: string; probability: number; curvature: number }>> =
    [...groups.entries()].map(([signature, branches]) => ({
      signature,
      probability: branches.reduce((total, branch): number => total + branch.probability, 0),
      curvature: weightedCurvature(branches),
    }));
  const totalProbability: number = totals.reduce((total, branch): number => total + branch.probability, 0);
  const branches: QuantumBranch[] = totals
    .map((branch) => ({
      id: `planetary:${branch.signature}`,
      probability: totalProbability === 0 ? 0 : precision(branch.probability / totalProbability),
      stateDelta: {
        node: "planetary",
        curvature: branch.curvature,
      },
      signature: branch.signature,
    }))
    .sort((left, right): number => right.probability - left.probability || compareOrdinal(left.signature, right.signature));
  return {
    branches,
    globalCurvature: totalProbability === 0
      ? 0
      : precision(totals.reduce(
        (total, branch): number => total + branch.curvature * branch.probability,
        0,
      ) / totalProbability),
    globalSignature: branches[0]?.signature ?? "",
    collapsePolicy,
  };
}

function formPlanetaryCanon(
  nodes: ReadonlyArray<PlanetaryNodeSnapshot>,
  governance: PlanetaryGovernanceContext,
  advisories: string[],
): PlanetaryCanon {
  const minimumStability: number = unitInterval(governance.globalTruthRules.minStability)
    ? governance.globalTruthRules.minStability
    : MIN_INSTITUTE_STABILITY;
  const truthIds: string[] = uniqueSorted(
    nodes.flatMap((node): string[] => Object.keys(node.canon.truths)),
  );
  const truths: Record<string, InstituteTruth> = {};
  for (const truthId of truthIds) {
    const replicas: InstituteTruth[] = nodes.flatMap((node): InstituteTruth[] => {
      const truth: InstituteTruth | undefined = node.canon.truths[truthId];
      return truth === undefined ? [] : [truth];
    });
    const signatures: string[] = uniqueSorted(nodes.flatMap((node): string[] => {
      const signature: string | undefined = node.truthSignatures[truthId];
      return signature === undefined ? [] : [signature];
    }));
    const stableAcrossNodes: boolean = replicas.length === nodes.length &&
      replicas.every((truth): boolean => sameTruthStructure(replicas[0], truth));
    const signaturesConverged: boolean = signatures.length === 1 &&
      nodes.every((node): boolean => node.truthSignatures[truthId] !== undefined);
    const stability: number = precision(average(replicas.map((truth): number => truth.stability)));
    const governanceApproved: boolean = governance.mode !== "strict" || stability >= minimumStability;
    if (!stableAcrossNodes || !signaturesConverged) {
      if (governance.mode === "advisory") advisories.push(`truth:${truthId}:global-convergence-warning`);
      continue;
    }
    if (!governanceApproved) {
      continue;
    }
    const first: InstituteTruth | undefined = replicas[0];
    if (first === undefined) continue;
    truths[truthId] = {
      id: truthId,
      description: first.description,
      sourceFacts: [...first.sourceFacts],
      stability,
      curvature: precision(average(replicas.map((truth): number => truth.curvature))),
      createdAt: Math.min(...replicas.map((truth): number => truth.createdAt)),
      updatedAt: Math.max(...replicas.map((truth): number => truth.updatedAt)),
    };
  }
  const truthValues: InstituteTruth[] = Object.values(truths);
  return {
    truths,
    version: Math.max(...nodes.map((node): number => node.canon.version)),
    updatedAt: Math.max(...nodes.map((node): number => node.canon.updatedAt)),
    globalStability: truthValues.length === 0
      ? 0
      : precision(average(truthValues.map((truth): number => truth.stability))),
  };
}

function sameTruthStructure(left: InstituteTruth | undefined, right: InstituteTruth): boolean {
  return left !== undefined && left.description === right.description &&
    left.sourceFacts.length === right.sourceFacts.length &&
    left.sourceFacts.every((factId, index): boolean => factId === right.sourceFacts[index]);
}

function nodePolicy(nodeId: string, governance: PlanetaryGovernanceContext): Record<string, unknown> {
  const value: unknown = governance.nodePolicies[nodeId];
  return isRecord(value) ? value : {};
}

function weightedCurvature(branches: ReadonlyArray<QuantumBranch>): number {
  const probability: number = branches.reduce((total, branch): number => total + branch.probability, 0);
  return probability === 0 ? 0 : precision(branches.reduce(
    (total, branch): number => total + branchCurvature(branch) * branch.probability,
    0,
  ) / probability);
}

function branchNode(branch: QuantumBranch): string {
  const value: unknown = branch.stateDelta.node;
  return nonEmptyString(value) ? value : "";
}

function branchCurvature(branch: QuantumBranch): number {
  const value: unknown = branch.stateDelta.curvature;
  return finiteNumber(value) ? value : 0;
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(
    (key: string): string => `${JSON.stringify(key)}:${stableJson(value[key])}`,
  ).join(",")}}`;
  return JSON.stringify(value);
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter(nonEmptyString).sort(compareOrdinal) : [];
}

function uniqueSorted(values: ReadonlyArray<string>): string[] {
  return [...new Set<string>(values)].sort(compareOrdinal);
}

function average(values: ReadonlyArray<number>): number {
  return values.length === 0 ? 0 : values.reduce((total, value): number => total + value, 0) / values.length;
}

function precision(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

function invalid(message: string): PlanetaryFailure {
  return { code: "INVALID_PLANETARY_STATE", message };
}

function denied(message: string): PlanetaryFailure {
  return { code: "PLANETARY_GOVERNANCE_DENIED", message };
}

function isMode(value: unknown): value is PlanetaryGovernanceContext["mode"] {
  return value === "strict" || value === "advisory" || value === "off";
}

function isCollapsePolicy(value: unknown): value is PlanetaryQuantumState["collapsePolicy"] {
  return value === "deterministic" || value === "probabilistic" || value === "governed";
}

function isEventAction(value: unknown): value is EpistemicEvent["action"] {
  return value === "added" || value === "updated" || value === "deprecated";
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
