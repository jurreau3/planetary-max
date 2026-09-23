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
  PlanetaryDelta,
  PlanetaryExecutionState,
  PlanetaryNode,
  PlanetaryNodeSnapshot,
  PlanetaryQuantumState,
  PlanetaryRuntimeState,
  PlanetaryState,
  PlanetarySubstrate,
  PlanetarySyncPacket,
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
    globalTick: 0,
    nodes: {},
    identities: {},
    substrates: {},
    substrate: initialGlobalSubstrate(),
    quantum: {
      branches: [],
      globalCurvature: 0,
      globalSignature: "",
      collapsePolicy: "deterministic",
      selectedBranch: null,
    },
    canon: { truths: {}, version: 0, updatedAt: 0, globalStability: 0 },
    governance: { mode: "strict", nodePolicies: {}, globalTruthRules: {}, collapseRules: {} },
    coordinatorIdentity: "",
    synchronizedAt: 0,
    packetSignature: "",
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
      if (synchronization.governance.mode !== "off") {
        advisories.push(`identity:${identityId}:incomplete-propagation`);
      }
    }
    const signatures: string[] = uniqueSorted(replicas.map((replica): string => replica.signature));
    const origins: string[] = uniqueSorted(replicas.map((replica): string => replica.originNode));
    const curvatures: ReadonlySet<number> = new Set<number>(replicas.map(
      (replica: PlanetaryIdentity): number => precision(replica.curvature),
    ));
    if (
      synchronization.governance.mode !== "off" &&
      (signatures.length !== 1 || origins.length !== 1 || curvatures.size !== 1)
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
    globalTick: Math.max(...synchronization.nodes.map(
      (node: PlanetaryNodeSnapshot): number => node.tick ?? synchronization.at,
    )),
    nodes: Object.fromEntries(synchronization.nodes.map((node: PlanetaryNodeSnapshot) => [
      node.nodeId,
      planetaryNode(node, synchronization.at),
    ])),
    identities,
    substrates,
    substrate: aggregateGlobalSubstrate(substrates),
    quantum,
    canon,
    governance: synchronization.governance,
    coordinatorIdentity: synchronization.coordinatorIdentity,
    synchronizedAt: synchronization.at,
    packetSignature: "",
    advisories: uniqueSorted(advisories),
  });
}

export function generatePlanetaryDelta(node: PlanetaryNode): PlanetaryDelta {
  return deepFreeze({
    nodeId: node.nodeId,
    tick: node.tick,
    simDelta: { identities: node.identities, substrates: node.substrates },
    inferenceDelta: node.inferenceDelta,
    quantumDelta: { branches: node.quantumBranches },
    instituteDelta: { canon: node.canon, truthSignatures: node.truthSignatures },
  });
}

export async function planetarySync(
  nodes: ReadonlyArray<PlanetaryNode>,
): Promise<PlanetarySyncPacket> {
  const deltas: PlanetaryDelta[] = nodes
    .map(generatePlanetaryDelta)
    .sort((left, right): number => compareOrdinal(left.nodeId, right.nodeId));
  const globalTick: number = deltas.length === 0
    ? 0
    : Math.max(...deltas.map((delta: PlanetaryDelta): number => delta.tick));
  return deepFreeze({
    deltas,
    globalTick,
    signature: await sha256(stableJson(deltas)),
  });
}

export function planetaryMerge(
  globalState: PlanetaryRuntimeState,
  packet: PlanetarySyncPacket,
  governance: PlanetaryGovernanceContext = globalState.governance,
  collapsePolicy: PlanetaryQuantumState["collapsePolicy"] = globalState.quantum.collapsePolicy,
  coordinatorIdentity: string = globalState.coordinatorIdentity,
  synchronizedAt: number = packet.globalTick,
): PlanetaryRuntimeState | PlanetaryFailure {
  const nodes: PlanetaryNode[] = packet.deltas.map(deltaToNode);
  const synchronization: PlanetarySynchronization = {
    at: synchronizedAt,
    coordinatorIdentity,
    nodes,
    governance,
    collapsePolicy,
  };
  const merged: PlanetaryState | PlanetaryFailure = synchronizePlanetaryState(synchronization);
  if (isPlanetaryFailure(merged)) return merged;
  return deepFreeze({
    ...merged,
    globalTick: packet.globalTick,
    nodes: Object.fromEntries(nodes.map((node: PlanetaryNode) => [node.nodeId, node])),
    packetSignature: packet.signature,
  });
}

export async function planetaryCollapse(
  globalState: PlanetaryRuntimeState,
  seed?: string,
): Promise<QuantumBranch | null | PlanetaryFailure> {
  const branches: ReadonlyArray<QuantumBranch> = globalState.quantum.branches;
  if (branches.length === 0) return null;
  if (
    globalState.quantum.collapsePolicy === "deterministic" ||
    globalState.quantum.collapsePolicy === "governed"
  ) {
    return branches[0] ?? null;
  }
  if (!nonEmptyString(seed)) {
    return invalid("Probabilistic planetary collapse requires a non-empty seed");
  }
  const draw: number = await seededUnitInterval(
    `${seed}\u0000${globalState.packetSignature}\u0000${stableJson(branches)}`,
  );
  let cumulative: number = 0;
  for (const branch of branches) {
    cumulative += branch.probability;
    if (draw < cumulative) return branch;
  }
  return branches.at(-1) ?? null;
}

export function planetaryTruthUpdate(
  globalState: PlanetaryRuntimeState,
  packet?: PlanetarySyncPacket,
): PlanetaryRuntimeState | PlanetaryFailure {
  const state: PlanetaryRuntimeState | PlanetaryFailure = packet === undefined
    ? globalState
    : planetaryMerge(globalState, packet);
  if (isPlanetaryFailure(state)) return state;
  const truths: InstituteTruth[] = Object.values(state.canon.truths);
  return deepFreeze({
    ...state,
    canon: {
      ...state.canon,
      globalStability: truths.length === 0
        ? 0
        : precision(average(truths.map((truth: InstituteTruth): number => truth.stability))),
    },
  });
}

export function stabilizePlanetaryExecution(
  globalState: PlanetaryRuntimeState,
  selectedBranch: QuantumBranch | null,
): PlanetaryExecutionState {
  const deprecatedTruthIds: string[] = globalState.advisories
    .filter((advisory: string): boolean => advisory.startsWith("truth:") &&
      advisory.endsWith(":global-convergence-conflict"))
    .map((advisory: string): string => advisory.slice(6, -28))
    .sort(compareOrdinal);
  const truths: Record<string, InstituteTruth> = {};
  for (const truth of Object.values(globalState.canon.truths)
    .sort((left, right): number => compareOrdinal(left.id, right.id))) {
    const stability: number = selectedBranch === null
      ? truth.stability
      : precision(average([truth.stability, selectedBranch.probability]));
    truths[truth.id] = {
      ...truth,
      stability,
      updatedAt: stability === truth.stability ? truth.updatedAt : globalState.synchronizedAt,
    };
  }
  const changed: boolean = Object.keys(truths).length > 0 || deprecatedTruthIds.length > 0;
  const canon: PlanetaryCanon = {
    truths,
    version: globalState.canon.version + (changed ? 1 : 0),
    updatedAt: changed ? globalState.synchronizedAt : globalState.canon.updatedAt,
    globalStability: Object.keys(truths).length === 0
      ? 0
      : precision(average(Object.values(truths).map(
        (truth: InstituteTruth): number => truth.stability,
      ))),
  };
  const identities: Record<string, PlanetaryIdentity> = {};
  for (const [identityId, identity] of Object.entries(globalState.identities)
    .sort(([left], [right]): number => compareOrdinal(left, right))) {
    const events: EpistemicEvent[] = [...identity.timeline.events];
    for (const truthId of Object.keys(truths).sort(compareOrdinal)) {
      events.push(executionEvent(globalState, identityId, truthId, "updated", selectedBranch));
    }
    for (const truthId of deprecatedTruthIds) {
      events.push(executionEvent(globalState, identityId, truthId, "deprecated", selectedBranch));
    }
    const eventMap: Map<string, EpistemicEvent> = new Map<string, EpistemicEvent>();
    for (const event of events) eventMap.set(event.id, event);
    identities[identityId] = {
      ...identity,
      curvature: selectedBranch === null
        ? identity.curvature
        : precision(average([identity.curvature, selectedBranch.curvature])),
      timeline: {
        identityId,
        events: [...eventMap.values()].sort(
          (left: EpistemicEvent, right: EpistemicEvent): number =>
            left.at - right.at || compareOrdinal(left.id, right.id),
        ),
      },
    };
  }
  const propagatedIdentities: PlanetaryIdentity[] = Object.values(identities);
  const nodes: Record<string, PlanetaryNode> = {};
  for (const [nodeId, node] of Object.entries(globalState.nodes)
    .sort(([left], [right]): number => compareOrdinal(left, right))) {
    nodes[nodeId] = {
      ...node,
      identities: propagatedIdentities,
      quantumBranches: selectedBranch === null ? [] : [{
        ...selectedBranch,
        id: `collapse:${globalState.globalTick}:${nodeId}`,
        node: nodeId,
        probability: 1,
      }],
      canon: {
        truths: canon.truths,
        version: canon.version,
        updatedAt: canon.updatedAt,
      },
      truthSignatures: Object.fromEntries(Object.keys(truths).sort(compareOrdinal).map(
        (truthId: string): readonly [string, string] => [
          truthId,
          selectedBranch?.signature ?? globalState.quantum.globalSignature,
        ],
      )),
    };
  }
  return deepFreeze({
    ...globalState,
    nodes,
    identities,
    canon,
    quantum: { ...globalState.quantum, selectedBranch },
  });
}

export function enforcePlanetaryGovernance(
  globalState: PlanetaryRuntimeState,
): PlanetaryRuntimeState | PlanetaryFailure {
  if (globalState.governance.mode !== "strict") return globalState;
  const limitValue: unknown = globalState.governance.globalTruthRules.curvatureLimit;
  if (limitValue === undefined) return globalState;
  if (!finiteNumber(limitValue) || limitValue < 0) {
    return invalid("Planetary curvatureLimit must be a non-negative finite number");
  }
  const identities: Record<string, PlanetaryIdentity> = {};
  for (const [identityId, identity] of Object.entries(globalState.identities)) {
    identities[identityId] = {
      ...identity,
      curvature: Math.min(identity.curvature, limitValue),
    };
  }
  const truths: Record<string, InstituteTruth> = {};
  for (const [truthId, truth] of Object.entries(globalState.canon.truths)) {
    truths[truthId] = { ...truth, curvature: Math.min(truth.curvature, limitValue) };
  }
  const clampBranch = (branch: QuantumBranch): QuantumBranch => ({
    ...branch,
    curvature: Math.min(branch.curvature, limitValue),
  });
  const nodes: Record<string, PlanetaryNode> = {};
  for (const [nodeId, node] of Object.entries(globalState.nodes)) {
    nodes[nodeId] = {
      ...node,
      identities: node.identities.map((identity: PlanetaryIdentity): PlanetaryIdentity => ({
        ...identity,
        curvature: Math.min(identity.curvature, limitValue),
      })),
      quantumBranches: node.quantumBranches.map(clampBranch),
      canon: {
        ...node.canon,
        truths: Object.fromEntries(Object.entries(node.canon.truths).map(
          ([truthId, truth]: [string, InstituteTruth]): readonly [string, InstituteTruth] => [
            truthId,
            { ...truth, curvature: Math.min(truth.curvature, limitValue) },
          ],
        )),
      },
    };
  }
  return deepFreeze({
    ...globalState,
    nodes,
    identities,
    canon: { ...globalState.canon, truths },
    quantum: {
      ...globalState.quantum,
      branches: globalState.quantum.branches.map(clampBranch),
      globalCurvature: Math.min(globalState.quantum.globalCurvature, limitValue),
      selectedBranch: globalState.quantum.selectedBranch === null
        ? null
        : clampBranch(globalState.quantum.selectedBranch),
    },
  });
}

export async function synchronizePlanetaryRuntime(
  synchronization: PlanetarySynchronization,
): Promise<PlanetaryRuntimeState | PlanetaryFailure> {
  const nodes: PlanetaryNode[] = synchronization.nodes.map(
    (node: PlanetaryNodeSnapshot): PlanetaryNode => planetaryNode(node, synchronization.at),
  );
  const packet: PlanetarySyncPacket = await planetarySync(nodes);
  const merged: PlanetaryRuntimeState | PlanetaryFailure = planetaryMerge(
    initialPlanetaryState(),
    packet,
    synchronization.governance,
    synchronization.collapsePolicy,
    synchronization.coordinatorIdentity,
    synchronization.at,
  );
  if (isPlanetaryFailure(merged)) return merged;
  const truthUpdated: PlanetaryRuntimeState | PlanetaryFailure = planetaryTruthUpdate(merged);
  if (isPlanetaryFailure(truthUpdated)) return truthUpdated;
  return enforcePlanetaryGovernance(truthUpdated);
}

export async function executePlanetaryRuntime(
  synchronization: PlanetarySynchronization,
  seed?: string,
): Promise<PlanetaryRuntimeState | PlanetaryFailure> {
  const governed: PlanetaryRuntimeState | PlanetaryFailure = await synchronizePlanetaryRuntime(
    synchronization,
  );
  if (isPlanetaryFailure(governed)) return governed;
  const selected: QuantumBranch | null | PlanetaryFailure = await planetaryCollapse(governed, seed);
  if (isPlanetaryFailure(selected)) return selected;
  return enforcePlanetaryGovernance(stabilizePlanetaryExecution(governed, selected));
}

export const executePlanetaryTick = executePlanetaryRuntime;

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
    (value.globalTruthRules.curvatureLimit !== undefined &&
      (!finiteNumber(value.globalTruthRules.curvatureLimit) ||
        value.globalTruthRules.curvatureLimit < 0)) ||
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
    (value.tick !== undefined && !nonNegativeInteger(value.tick)) ||
    (value.inferenceDelta !== undefined && !isRecord(value.inferenceDelta)) ||
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
    ...(value.tick === undefined ? {} : { tick: value.tick }),
    identities,
    substrates,
    quantumBranches,
    canon,
    truthSignatures,
    ...(value.inferenceDelta === undefined
      ? {}
      : { inferenceDelta: structuredClone(value.inferenceDelta) }),
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
    !isRecord(value) || !nonEmptyString(value.id) || value.node !== nodeId ||
    !unitInterval(value.probability) || !finiteNumber(value.curvature) || !nonEmptyString(value.signature)
  ) return null;
  return deepFreeze({
    id: value.id,
    node: nodeId,
    probability: value.probability,
    curvature: value.curvature,
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
        if (governance.mode !== "off") {
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
      compareOrdinal(left.node, right.node) || compareOrdinal(left.id, right.id),
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
      node: "planetary",
      probability: totalProbability === 0 ? 0 : precision(branch.probability / totalProbability),
      curvature: branch.curvature,
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
    selectedBranch: null,
  };
}

function planetaryNode(node: PlanetaryNodeSnapshot, fallbackTick: number): PlanetaryNode {
  return deepFreeze({
    nodeId: node.nodeId,
    tick: node.tick ?? fallbackTick,
    identities: node.identities,
    substrates: node.substrates,
    quantumBranches: node.quantumBranches,
    canon: node.canon,
    truthSignatures: node.truthSignatures,
    inferenceDelta: node.inferenceDelta ?? {},
  });
}

function deltaToNode(delta: PlanetaryDelta): PlanetaryNode {
  return deepFreeze({
    nodeId: delta.nodeId,
    tick: delta.tick,
    identities: delta.simDelta.identities,
    substrates: delta.simDelta.substrates,
    quantumBranches: delta.quantumDelta.branches,
    canon: delta.instituteDelta.canon,
    truthSignatures: delta.instituteDelta.truthSignatures,
    inferenceDelta: delta.inferenceDelta,
  });
}

function initialGlobalSubstrate(): PlanetarySubstrate {
  return deepFreeze({
    id: "planetary",
    nodes: [],
    topology: {},
    stability: 1,
    anomalies: [],
  });
}

function aggregateGlobalSubstrate(
  substrates: Readonly<Record<string, PlanetarySubstrate>>,
): PlanetarySubstrate {
  const values: PlanetarySubstrate[] = Object.values(substrates)
    .sort((left, right): number => compareOrdinal(left.id, right.id));
  if (values.length === 0) return initialGlobalSubstrate();
  return deepFreeze({
    id: "planetary",
    nodes: uniqueSorted(values.flatMap(
      (substrate: PlanetarySubstrate): ReadonlyArray<string> => substrate.nodes,
    )),
    topology: Object.fromEntries(values.map((substrate: PlanetarySubstrate) => [
      substrate.id,
      substrate.topology,
    ])),
    stability: precision(average(values.map(
      (substrate: PlanetarySubstrate): number => substrate.stability,
    ))),
    anomalies: mergeAnomalies(values.flatMap(
      (substrate: PlanetarySubstrate): ReadonlyArray<PlanetaryAnomaly> => substrate.anomalies,
    )),
  });
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
      if (governance.mode !== "off") {
        advisories.push(`truth:${truthId}:global-convergence-conflict`);
      }
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

function executionEvent(
  state: PlanetaryRuntimeState,
  identityId: string,
  truthId: string,
  action: EpistemicEvent["action"],
  selectedBranch: QuantumBranch | null,
): EpistemicEvent {
  return {
    id: `planetary:${state.globalTick}:${identityId}:${truthId}:${action}`,
    truthId,
    action,
    at: state.synchronizedAt,
    meta: {
      governance: { mode: state.governance.mode, decision: "allowed" },
      packetSignature: state.packetSignature,
      quantumSignature: selectedBranch?.signature ?? null,
    },
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
    (total, branch): number => total + branch.curvature * branch.probability,
    0,
  ) / probability);
}

function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;
  if (isRecord(value)) return `{${Object.keys(value).sort().map(
    (key: string): string => `${JSON.stringify(key)}:${stableJson(value[key])}`,
  ).join(",")}}`;
  return JSON.stringify(value);
}

async function sha256(value: string): Promise<string> {
  const digest: ArrayBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return [...new Uint8Array(digest)]
    .map((byte: number): string => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function seededUnitInterval(value: string): Promise<number> {
  const digest: ArrayBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  const bytes: Uint8Array<ArrayBuffer> = new Uint8Array(digest);
  let integer: number = 0;
  for (let index: number = 0; index < 6; index += 1) {
    integer = integer * 256 + (bytes[index] ?? 0);
  }
  return integer / 281_474_976_710_656;
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
