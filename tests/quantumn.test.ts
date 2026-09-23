import { describe, expect, it } from "vitest";
import {
  collapseQuantumBranches,
  generateQuantumBranches,
  generateQuantumOverlay,
  normalizeProbabilities,
  runInference,
  type InferenceArtifacts,
  type InferenceHypothesis,
  type InferenceRecommendation,
  type QuantumBranch,
  type SimEvent,
} from "../src/index";
import type { QuantumSimulationInput } from "../src/quantumn";

function classical(events: ReadonlyArray<SimEvent> = []): QuantumSimulationInput {
  return {
    agents: {
      "agent-1": {
        id: "agent-1",
        identityId: "identity-1",
        traits: {},
        mood: "neutral",
        goals: {},
        location: { x: 0, y: 0 },
        tickVersion: 1,
      },
    },
    windows: {},
    substrate: {
      id: "substrate",
      resources: { compute: 10 },
      topology: {},
      stability: 92,
      anomalies: [],
    },
    events: [],
    eventLog: events,
    tecTasks: {},
    tick: 2,
  };
}

describe("MAX-Quantumn", () => {
  it("generates the expected quantum branches from classical state", () => {
    const branches = generateQuantumBranches(classical(), { "identity-1": 0 }, "seed-1");

    expect(branches.map((branch: QuantumBranch): string => branch.id)).toEqual([
      "branch:2:classical",
      "branch:2:expansion",
      "branch:2:convergence",
    ]);
    expect(branches[0]?.stateDelta).toEqual({});
    expect(branches[1]?.stateDelta).toMatchObject({
      substrate: { topologyBifurcation: true, resourceEnvelope: "expand" },
    });
    expect(branches.every((branch: QuantumBranch): boolean => branch.signature.startsWith("MAX-")))
      .toBe(true);
  });

  it("normalizes branch probabilities to exactly one", () => {
    const probabilities = normalizeProbabilities([0.7, 0.2, 0.4]);
    const branches = generateQuantumBranches(classical(), { "identity-1": 0.8 }, "seed-1");

    expect(probabilities.reduce((sum: number, value: number): number => sum + value, 0)).toBe(1);
    expect(branches.reduce((sum: number, branch: QuantumBranch): number =>
      sum + branch.probability, 0)).toBe(1);
  });

  it("changes branch probabilities deterministically with curvature", () => {
    const expanding = generateQuantumBranches(classical(), { "identity-1": 1 }, "seed-1");
    const converging = generateQuantumBranches(classical(), { "identity-1": -1 }, "seed-1");
    const expansionProbability = (branches: ReadonlyArray<QuantumBranch>): number =>
      branches.find((branch: QuantumBranch): boolean => branch.id.endsWith(":expansion"))!.probability;
    const convergenceProbability = (branches: ReadonlyArray<QuantumBranch>): number =>
      branches.find((branch: QuantumBranch): boolean => branch.id.endsWith(":convergence"))!.probability;

    expect(expansionProbability(expanding)).toBeGreaterThan(expansionProbability(converging));
    expect(convergenceProbability(converging)).toBeGreaterThan(convergenceProbability(expanding));
    expect(generateQuantumBranches(classical(), { "identity-1": 1 }, "seed-1"))
      .toEqual(expanding);
  });

  it("lets strict Umbrella governance force an allowed collapse", () => {
    const overlay = generateQuantumOverlay({
      classical: classical(),
      seed: "governed-seed",
      collapsePolicy: "probabilistic",
      governanceMode: "strict",
      governanceContext: {
        quantum: {
          allowedBranches: ["branch:2:convergence"],
          forcedCollapse: "branch:2:convergence",
          curvatureLimit: 0.2,
        },
      },
    });

    expect(overlay.state.collapsePolicy).toBe("governed");
    expect(overlay.selectedBranchId).toBe("branch:2:convergence");
    expect(overlay.curvature["identity-1"]).toBeLessThanOrEqual(0.2);
    expect(() => collapseQuantumBranches(
      overlay.state.branches,
      "governed",
      "seed",
      { allowedBranches: ["missing"], forcedCollapse: "missing" },
      "strict",
    )).toThrow("denied all quantum branches");
  });

  it("replays probabilistic collapse identically with the same seed", () => {
    const input = {
      classical: classical(),
      seed: "replay-seed",
      collapsePolicy: "probabilistic" as const,
    };

    expect(generateQuantumOverlay(input)).toEqual(generateQuantumOverlay(input));
  });

  it("feeds branch probabilities and curvature advice into inference", () => {
    const move: SimEvent = {
      id: "move-1",
      type: "agent.move",
      payload: { agentId: "agent-1", dx: 1, dy: 0 },
      at: 1,
      identityId: "identity-1",
    };
    const simulation = classical([move]);
    const overlay = generateQuantumOverlay({ classical: simulation, seed: "inference-seed" });
    const result: InferenceArtifacts = runInference({
      simulation: { ...simulation, diffLog: [] },
      quantum: overlay,
    });

    expect(result.facts).toEqual(expect.arrayContaining([
      expect.objectContaining({ data: expect.objectContaining({ source: "quantum-branch" }) }),
      expect.objectContaining({ data: expect.objectContaining({ source: "quantum-curvature" }) }),
    ]));
    expect(result.hypotheses.some((hypothesis: InferenceHypothesis): boolean =>
      hypothesis.tags.includes("quantum-branching"))).toBe(true);
    expect(result.recommendations.some((recommendation: InferenceRecommendation): boolean =>
      recommendation.action.includes("collapse policy"))).toBe(true);
  });
});
