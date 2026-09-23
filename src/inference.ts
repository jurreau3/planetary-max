import type {
  GovernanceInference,
  InferenceArtifacts,
  InferenceFact,
  InferenceFactKind,
  InferenceHypothesis,
  InferenceRecommendation,
  InferenceRecommendationTarget,
  KernelResult,
  PortalKernelState,
  QuantumOverlay,
  SimEvent,
  SimTecTaskState,
  SimTickDiff,
  SimWindowState,
} from "./types";

export type InferenceSimulationInput = PortalKernelState & Readonly<{
  eventLog: ReadonlyArray<SimEvent>;
  diffLog: ReadonlyArray<SimTickDiff>;
  tecTasks: Readonly<Record<string, SimTecTaskState>>;
}>;

export type InferenceInput = Readonly<{
  kernelResults?: ReadonlyArray<KernelResult>;
  simulation?: InferenceSimulationInput;
  quantum?: QuantumOverlay;
}>;

const FACT_KINDS: ReadonlySet<string> = new Set([
  "agent",
  "window",
  "substrate",
  "governance",
  "tec",
]);

export function runInference(input: InferenceInput): InferenceArtifacts {
  const facts: ReadonlyArray<InferenceFact> = [
    ...(input.kernelResults ?? []).flatMap(
      (result: KernelResult, index: number): ReadonlyArray<InferenceFact> =>
        extractKernelResultFacts(result, index),
    ),
    ...(input.simulation === undefined ? [] : extractSimulationFacts(input.simulation)),
    ...(input.quantum === undefined ? [] : extractQuantumFacts(input.quantum)),
  ].sort(compareFacts);
  const hypotheses: ReadonlyArray<InferenceHypothesis> = detectInferencePatterns(facts);
  return deepFreeze({
    facts,
    hypotheses,
    recommendations: generateInferenceRecommendations(hypotheses),
  });
}

export function extractQuantumFacts(
  quantum: QuantumOverlay,
): ReadonlyArray<InferenceFact> {
  const at: number = safeIntegerValue(quantum.state.meta.tick) ?? 0;
  const facts: InferenceFact[] = quantum.state.branches.map((branch): InferenceFact =>
    makeFact(`quantum:${quantum.state.id}:${branch.id}`, "substrate", branch.id, at, {
      source: "quantum-branch",
      probability: branch.probability,
      stateDelta: structuredClone(branch.stateDelta),
      signature: branch.signature,
      selected: branch.id === quantum.selectedBranchId,
      collapsePolicy: quantum.state.collapsePolicy,
    }),
  );
  for (const [identityId, curvature] of Object.entries(quantum.curvature).sort(
    ([left], [right]): number => compareOrdinal(left, right),
  )) {
    facts.push(makeFact(`quantum:${quantum.state.id}:curvature:${identityId}`, "agent", identityId, at, {
      source: "quantum-curvature",
      curvature,
    }));
  }
  return deepFreeze(facts.sort(compareFacts));
}

export function extractKernelResultFacts(
  result: KernelResult,
  fallbackAt: number = 0,
): ReadonlyArray<InferenceFact> {
  const meta: Readonly<Record<string, unknown>> = result.meta ?? {};
  const sim: Readonly<Record<string, unknown>> | undefined = recordValue(meta.sim);
  const messageId: string = stringValue(meta.messageId) ?? `result-${fallbackAt}`;
  const at: number = safeIntegerValue(sim?.tickVersion) ?? fallbackAt;
  const facts: InferenceFact[] = [];

  const simKind: InferenceFactKind | undefined = inferenceKind(sim?.kind);
  const entityId: string | undefined = stringValue(sim?.entityId);
  if (sim !== undefined && simKind !== undefined && entityId !== undefined) {
    facts.push(makeFact(`kernel:${messageId}:sim`, simKind, entityId, at, {
      source: "kernel-result",
      ok: result.ok,
      ...sim,
    }));
  }

  const governance: Readonly<Record<string, unknown>> | undefined = recordValue(meta.governance);
  if (governance !== undefined) {
    facts.push(makeFact(`kernel:${messageId}:governance`, "governance", messageId, at, {
      source: "kernel-result",
      ...governance,
    }));
  }

  const substrate: Readonly<Record<string, unknown>> | undefined = recordValue(meta.substrate);
  if (substrate !== undefined) {
    facts.push(makeFact(`kernel:${messageId}:substrate`, "substrate", "substrate", at, {
      source: "kernel-result",
      ...substrate,
    }));
  }

  const windows: ReadonlyArray<unknown> = Array.isArray(meta.windows) ? meta.windows : [];
  windows.forEach((window: unknown, index: number): void => {
    const value: Readonly<Record<string, unknown>> | undefined = recordValue(window);
    if (value === undefined) return;
    const subjectId: string = stringValue(value.id) ?? `window-${index}`;
    facts.push(makeFact(`kernel:${messageId}:window:${subjectId}`, "window", subjectId, at, {
      source: "kernel-result",
      ...value,
    }));
  });

  return deepFreeze(facts.sort(compareFacts));
}

export function extractSimulationFacts(
  simulation: InferenceSimulationInput,
): ReadonlyArray<InferenceFact> {
  const facts: InferenceFact[] = simulation.eventLog.map((event: SimEvent): InferenceFact =>
    makeFact(`event:${event.id}`, eventKind(event.type), eventSubject(event), event.at, {
      source: "simulation-event",
      eventType: event.type,
      payload: structuredClone(event.payload),
      ...(event.identityId === undefined ? {} : { identityId: event.identityId }),
    }),
  );

  for (const agent of Object.values(simulation.agents)) {
    facts.push(makeFact(`snapshot:${simulation.tick}:agent:${agent.id}`, "agent", agent.id, simulation.tick, {
      source: "simulation-snapshot",
      state: structuredClone(agent),
    }));
  }
  const windows: ReadonlyArray<SimWindowState> = Object.values(simulation.windows).sort(
    (left: SimWindowState, right: SimWindowState): number => compareOrdinal(left.id, right.id),
  );
  for (const window of windows) {
    facts.push(makeFact(`snapshot:${simulation.tick}:window:${window.id}`, "window", window.id, simulation.tick, {
      source: "simulation-snapshot",
      state: structuredClone(window),
    }));
  }
  facts.push(makeFact(`snapshot:${simulation.tick}:substrate`, "substrate", simulation.substrate.id, simulation.tick, {
    source: "simulation-snapshot",
    stability: simulation.substrate.stability,
    anomalyCount: simulation.substrate.anomalies.length,
    resources: structuredClone(simulation.substrate.resources),
    topology: structuredClone(simulation.substrate.topology),
  }));
  for (const task of Object.values(simulation.tecTasks).sort(
    (left: SimTecTaskState, right: SimTecTaskState): number => compareOrdinal(left.id, right.id),
  )) {
    facts.push(makeFact(`snapshot:${simulation.tick}:tec:${task.id}`, "tec", task.id, simulation.tick, {
      source: "simulation-snapshot",
      status: task.status,
      identityId: task.identityId,
      tickVersion: task.tickVersion,
    }));
  }
  return deepFreeze(facts.sort(compareFacts));
}

export function detectInferencePatterns(
  facts: ReadonlyArray<InferenceFact>,
): ReadonlyArray<InferenceHypothesis> {
  const hypotheses: InferenceHypothesis[] = [];
  const eventGroups = new Map<string, InferenceFact[]>();
  for (const fact of facts) {
    if (fact.data.source !== "simulation-event" || typeof fact.data.eventType !== "string") continue;
    const key: string = `${fact.kind}:${fact.subjectId}:${fact.data.eventType}`;
    eventGroups.set(key, [...(eventGroups.get(key) ?? []), fact]);
  }
  for (const [key, groupedFacts] of [...eventGroups.entries()].sort(([left], [right]) =>
    compareOrdinal(left, right),
  )) {
    if (groupedFacts.length < 2) continue;
    const first: InferenceFact = groupedFacts[0]!;
    const eventType: string = String(first.data.eventType);
    hypotheses.push(makeHypothesis(
      `recurring:${key}`,
      `${first.subjectId} repeatedly produced ${eventType} events`,
      risingConfidence(groupedFacts.length),
      groupedFacts.map((fact: InferenceFact): string => fact.id),
      ["recurring-behavior", first.kind, eventType],
    ));
  }

  const substrateSnapshots: ReadonlyArray<InferenceFact> = facts.filter(
    (fact: InferenceFact): boolean =>
      fact.kind === "substrate" &&
      fact.data.source === "simulation-snapshot" &&
      typeof fact.data.stability === "number",
  );
  for (const snapshot of substrateSnapshots) {
    const stability: number = Number(snapshot.data.stability);
    const anomalyFacts: ReadonlyArray<InferenceFact> = facts.filter(
      (fact: InferenceFact): boolean =>
        fact.kind === "substrate" && fact.data.source === "simulation-event",
    );
    if (stability >= 90 && anomalyFacts.length < 2) continue;
    hypotheses.push(makeHypothesis(
      `substrate-instability:${snapshot.subjectId}:${snapshot.at}`,
      `Substrate stability is degraded at ${formatNumber(stability)}`,
      clampConfidence(0.55 + (100 - stability) / 100 + anomalyFacts.length * 0.03),
      uniqueSorted([...anomalyFacts.map((fact: InferenceFact): string => fact.id), snapshot.id]),
      ["substrate-instability", "substrate"],
    ));
  }

  const governanceGroups = new Map<string, InferenceFact[]>();
  for (const fact of facts) {
    if (fact.kind !== "governance" || typeof fact.data.decision !== "string") continue;
    const decision: string = fact.data.decision;
    if (decision !== "denied" && decision !== "advisory") continue;
    governanceGroups.set(decision, [...(governanceGroups.get(decision) ?? []), fact]);
  }
  for (const [decision, groupedFacts] of [...governanceGroups.entries()].sort(([left], [right]) =>
    compareOrdinal(left, right),
  )) {
    if (groupedFacts.length < 2) continue;
    hypotheses.push(makeHypothesis(
      `governance-impact:${decision}`,
      `Governance repeatedly produced ${decision} decisions`,
      risingConfidence(groupedFacts.length),
      groupedFacts.map((fact: InferenceFact): string => fact.id),
      ["governance-impact", decision],
    ));
  }

  const pendingTasks: ReadonlyArray<InferenceFact> = facts.filter(
    (fact: InferenceFact): boolean =>
      fact.kind === "tec" &&
      fact.data.source === "simulation-snapshot" &&
      fact.data.status === "created",
  );
  if (pendingTasks.length > 0) {
    hypotheses.push(makeHypothesis(
      "tec-bottleneck:pending-tasks",
      `${pendingTasks.length} TEC task${pendingTasks.length === 1 ? " is" : "s are"} awaiting completion`,
      clampConfidence(0.55 + pendingTasks.length * 0.08),
      pendingTasks.map((fact: InferenceFact): string => fact.id),
      ["tec-bottleneck", "tec"],
    ));
  }

  const branchFacts: ReadonlyArray<InferenceFact> = facts.filter(
    (fact: InferenceFact): boolean => fact.data.source === "quantum-branch",
  );
  if (branchFacts.length > 1) {
    hypotheses.push(makeHypothesis(
      "quantum-branching:active-worldlines",
      `Quantum overlay maintains ${branchFacts.length} explainable worldlines`,
      clampConfidence(0.55 + branchFacts.length * 0.08),
      branchFacts.map((fact: InferenceFact): string => fact.id),
      ["quantum-branching", "quantum"],
    ));
  }

  for (const fact of facts.filter(
    (candidate: InferenceFact): boolean =>
      candidate.data.source === "quantum-curvature" &&
      typeof candidate.data.curvature === "number" &&
      Math.abs(candidate.data.curvature) >= 0.25,
  )) {
    const curvature: number = Number(fact.data.curvature);
    hypotheses.push(makeHypothesis(
      `quantum-curvature:${fact.subjectId}`,
      `${fact.subjectId} identity curvature is ${curvature > 0 ? "expanding" : "converging"} at ${formatNumber(curvature)}`,
      clampConfidence(0.6 + Math.min(0.35, Math.abs(curvature) * 0.1)),
      [fact.id],
      ["quantum-curvature", curvature > 0 ? "expansion" : "convergence", "quantum"],
    ));
  }

  return deepFreeze(hypotheses.sort(compareHypotheses));
}

export function generateInferenceRecommendations(
  hypotheses: ReadonlyArray<InferenceHypothesis>,
): ReadonlyArray<InferenceRecommendation> {
  return deepFreeze(hypotheses.map((hypothesis: InferenceHypothesis): InferenceRecommendation => {
    const rule: Readonly<{
      target: InferenceRecommendationTarget;
      action: string;
    }> = recommendationRule(hypothesis.tags);
    return {
      id: `recommendation:${hypothesis.id}`,
      target: rule.target,
      action: rule.action,
      rationale: hypothesis.description,
      confidence: hypothesis.confidence,
      relatedHypotheses: [hypothesis.id],
    };
  }).sort(compareRecommendations));
}

export function governanceInferenceFromContext(
  context: Readonly<Record<string, unknown>>,
): GovernanceInference | undefined {
  const inference: Readonly<Record<string, unknown>> | undefined = recordValue(context.inference);
  if (
    inference === undefined ||
    !Array.isArray(inference.hypotheses) ||
    !Array.isArray(inference.recommendations)
  ) {
    return undefined;
  }
  return deepFreeze({
    hypotheses: structuredClone(inference.hypotheses) as InferenceHypothesis[],
    recommendations: structuredClone(inference.recommendations) as InferenceRecommendation[],
  });
}

function recommendationRule(tags: ReadonlyArray<string>): Readonly<{
  target: InferenceRecommendationTarget;
  action: string;
}> {
  if (tags.includes("substrate-instability")) {
    return { target: "substrate", action: "Reduce load and tighten substrate shift limits" };
  }
  if (tags.includes("tec-bottleneck")) {
    return { target: "tec", action: "Reroute or rebalance pending TEC tasks" };
  }
  if (tags.includes("governance-impact")) {
    return { target: "governance", action: "Review the repeatedly triggered governance policy" };
  }
  if (tags.includes("quantum-curvature")) {
    return { target: "governance", action: "Throttle identity curvature or adjust its propagation" };
  }
  if (tags.includes("quantum-branching")) {
    return { target: "simulation", action: "Reduce branching or select a stricter collapse policy" };
  }
  if (tags.includes("agent")) {
    return { target: "identity", action: "Review the identity's recurring simulation behavior" };
  }
  return { target: "simulation", action: "Adjust simulation parameters for the recurring behavior" };
}

function makeFact(
  id: string,
  kind: InferenceFactKind,
  subjectId: string,
  at: number,
  data: Readonly<Record<string, unknown>>,
): InferenceFact {
  return deepFreeze({ id: `fact:${id}`, kind, subjectId, at, data });
}

function makeHypothesis(
  id: string,
  description: string,
  confidence: number,
  supportingFacts: ReadonlyArray<string>,
  tags: ReadonlyArray<string>,
): InferenceHypothesis {
  return deepFreeze({
    id: `hypothesis:${id}`,
    description,
    confidence,
    supportingFacts: uniqueSorted(supportingFacts),
    tags: uniqueSorted(tags),
  });
}

function eventKind(type: string): InferenceFactKind {
  if (type.startsWith("agent.")) return "agent";
  if (type.startsWith("window.")) return "window";
  if (type.startsWith("tec.")) return "tec";
  return "substrate";
}

function eventSubject(event: SimEvent): string {
  const key: string = event.type.startsWith("agent.")
    ? "agentId"
    : event.type.startsWith("window.")
      ? "windowId"
      : event.type.startsWith("tec.")
        ? "taskId"
        : "substrateId";
  return stringValue(event.payload[key]) ?? (key === "substrateId" ? "substrate" : event.id);
}

function inferenceKind(value: unknown): InferenceFactKind | undefined {
  return typeof value === "string" && FACT_KINDS.has(value)
    ? value as InferenceFactKind
    : undefined;
}

function risingConfidence(count: number): number {
  return clampConfidence(0.5 + count * 0.1);
}

function clampConfidence(value: number): number {
  return Math.round(Math.min(0.99, Math.max(0, value)) * 100) / 100;
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function safeIntegerValue(value: unknown): number | undefined {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : undefined;
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.length > 0 ? value : undefined;
}

function recordValue(value: unknown): Readonly<Record<string, unknown>> | undefined {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as Readonly<Record<string, unknown>>
    : undefined;
}

function uniqueSorted(values: ReadonlyArray<string>): ReadonlyArray<string> {
  return [...new Set(values)].sort(compareOrdinal);
}

function compareFacts(left: InferenceFact, right: InferenceFact): number {
  return left.at - right.at || compareOrdinal(left.id, right.id);
}

function compareHypotheses(left: InferenceHypothesis, right: InferenceHypothesis): number {
  return compareOrdinal(left.id, right.id);
}

function compareRecommendations(
  left: InferenceRecommendation,
  right: InferenceRecommendation,
): number {
  return compareOrdinal(left.id, right.id);
}

function compareOrdinal(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function deepFreeze<T>(value: T): T {
  if (typeof value !== "object" || value === null || Object.isFrozen(value)) return value;
  for (const nested of Object.values(value)) deepFreeze(nested);
  return Object.freeze(value);
}
