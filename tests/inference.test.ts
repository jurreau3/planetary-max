import { describe, expect, it } from "vitest";
import { evaluateGovernance } from "../src/governance";
import {
  extractKernelResultFacts,
  readKernelResult,
  runInference,
  type InferenceArtifacts,
  type InferenceHypothesis,
  type InferenceRecommendation,
  type KernelEnvelope,
  type KernelResult,
  type SimEvent,
} from "../src/index";
import type { InferenceSimulationInput } from "../src/inference";

function event(
  id: string,
  type: SimEvent["type"],
  payload: Record<string, unknown>,
  at: number,
  identityId?: string,
): SimEvent {
  return { id, type, payload, at, ...(identityId === undefined ? {} : { identityId }) };
}

function simulation(
  eventLog: ReadonlyArray<SimEvent>,
  stability: number = 100,
  tecTasks: InferenceSimulationInput["tecTasks"] = {},
): InferenceSimulationInput {
  return {
    agents: {},
    windows: {},
    substrate: {
      id: "substrate",
      resources: {},
      topology: {},
      stability,
      anomalies: eventLog.filter((item: SimEvent): boolean => item.type.startsWith("substrate.")),
    },
    events: [],
    eventLog,
    diffLog: [],
    tecTasks,
    tick: 4,
  };
}

describe("MAX-Inference", () => {
  it("extracts classified facts from known KernelResult metadata", () => {
    const result: KernelResult = {
      ok: true,
      meta: {
        messageId: "kernel-message-1",
        sim: { entityId: "agent-7", kind: "agent", tickVersion: 12 },
        governance: { mode: "advisory", decision: "advisory", deltas: [] },
        substrate: { stability: 84 },
        windows: [{ id: "window-2", focus: true }],
      },
    };

    expect(extractKernelResultFacts(result)).toEqual([
      {
        id: "fact:kernel:kernel-message-1:governance",
        kind: "governance",
        subjectId: "kernel-message-1",
        at: 12,
        data: {
          source: "kernel-result",
          mode: "advisory",
          decision: "advisory",
          deltas: [],
        },
      },
      {
        id: "fact:kernel:kernel-message-1:sim",
        kind: "agent",
        subjectId: "agent-7",
        at: 12,
        data: {
          source: "kernel-result",
          ok: true,
          entityId: "agent-7",
          kind: "agent",
          tickVersion: 12,
        },
      },
      {
        id: "fact:kernel:kernel-message-1:substrate",
        kind: "substrate",
        subjectId: "substrate",
        at: 12,
        data: { source: "kernel-result", stability: 84 },
      },
      {
        id: "fact:kernel:kernel-message-1:window:window-2",
        kind: "window",
        subjectId: "window-2",
        at: 12,
        data: { source: "kernel-result", id: "window-2", focus: true },
      },
    ]);
  });

  it("raises confidence as recurring behavior gains supporting facts", () => {
    const events: ReadonlyArray<SimEvent> = [
      event("move-1", "agent.move", { agentId: "agent-1", dx: 1, dy: 0 }, 1, "identity-1"),
      event("move-2", "agent.move", { agentId: "agent-1", dx: 1, dy: 0 }, 2, "identity-1"),
      event("move-3", "agent.move", { agentId: "agent-1", dx: 1, dy: 0 }, 3, "identity-1"),
    ];
    const twice: InferenceArtifacts = runInference({ simulation: simulation(events.slice(0, 2)) });
    const threeTimes: InferenceArtifacts = runInference({ simulation: simulation(events) });
    const twiceHypothesis = twice.hypotheses.find(
      (item: InferenceHypothesis): boolean => item.tags.includes("recurring-behavior"),
    );
    const threeTimesHypothesis = threeTimes.hypotheses.find(
      (item: InferenceHypothesis): boolean => item.tags.includes("recurring-behavior"),
    );

    expect(twiceHypothesis?.supportingFacts).toHaveLength(2);
    expect(threeTimesHypothesis?.supportingFacts).toHaveLength(3);
    expect(threeTimesHypothesis!.confidence).toBeGreaterThan(twiceHypothesis!.confidence);
  });

  it("recommends a transparent substrate adjustment for instability", () => {
    const shift = event("shift-1", "substrate.shift", { magnitude: 35 }, 1);
    const result: InferenceArtifacts = runInference({ simulation: simulation([shift], 65) });
    const hypothesis = result.hypotheses.find(
      (item: InferenceHypothesis): boolean => item.tags.includes("substrate-instability"),
    );
    const recommendation = result.recommendations.find(
      (item: InferenceRecommendation): boolean => item.target === "substrate",
    );

    expect(hypothesis?.supportingFacts).toEqual([
      "fact:event:shift-1",
      "fact:snapshot:4:substrate",
    ]);
    expect(recommendation).toMatchObject({
      action: "Reduce load and tighten substrate shift limits",
      rationale: "Substrate stability is degraded at 65",
      relatedHypotheses: [hypothesis?.id],
    });
  });

  it("annotates advisory governance decisions with inference artifacts", async () => {
    const artifacts: InferenceArtifacts = runInference({
      simulation: simulation([event("shift-1", "substrate.shift", { magnitude: 20 }, 1)], 80),
    });
    const envelope: KernelEnvelope = {
      id: "message-1",
      type: "sim.substrate.tick",
      payload: {},
      identity: "identity-1",
      governanceContext: {
        mode: "advisory",
        inference: {
          hypotheses: artifacts.hypotheses,
          recommendations: artifacts.recommendations,
        },
      },
    };

    expect(evaluateGovernance(envelope, "advisory")).toMatchObject({
      mode: "advisory",
      decision: "advisory",
      inference: {
        hypotheses: artifacts.hypotheses,
        recommendations: artifacts.recommendations,
      },
    });
    expect(await readKernelResult(Response.json({ ok: true, result: {} }), envelope, "MAX-OS-1"))
      .toMatchObject({
        meta: {
          governance: {
            mode: "advisory",
            decision: "advisory",
            inference: {
              hypotheses: artifacts.hypotheses,
              recommendations: artifacts.recommendations,
            },
          },
        },
      });
  });

  it("returns identical artifacts for the same input sequence", () => {
    const input = simulation(
      [
        event("task-1", "tec.task.created", { taskId: "task-1" }, 1, "identity-1"),
        event("focus-1", "window.focus", { windowId: "window-1", focus: true }, 2, "identity-1"),
        event("focus-2", "window.focus", { windowId: "window-1", focus: false }, 3, "identity-1"),
      ],
      100,
      {
        "task-1": {
          id: "task-1",
          identityId: "identity-1",
          status: "created",
          tickVersion: 1,
        },
      },
    );

    expect(runInference({ simulation: input })).toEqual(runInference({ simulation: input }));
  });
});
