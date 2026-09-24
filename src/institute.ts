//
// MAX‑Institute Canon + Truth Layer
// Unified Portal‑OS Wing
//

import {
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

export function initialInstituteState(): InstituteState {
  return {
    canon: {
      truths: [],
      signature: "initial",
    },
    timeline: [],
  };
}

export function recordEpistemicEvent(
  state: InstituteState,
  event: EpistemicEvent
): InstituteState {
  return {
    ...state,
    timeline: [...state.timeline, event],
  };
}

export function formTruth(
  state: InstituteState,
  payload: unknown
): InstituteTruthFormation {
  const truth: InstituteTruth = {
    id: `truth-${state.canon.truths.length}`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    payload,
    stability: 1,
  };

  const nextCanon: InstituteCanon = {
    truths: [...state.canon.truths, truth],
    signature: `canon-${truth.id}`,
  };

  return {
    truth,
    advisory: undefined,
  };
}
