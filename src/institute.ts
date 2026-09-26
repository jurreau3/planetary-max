//
// MAX‑Institute Substrate
// Canon + Epistemic Timeline + Envelopes
//

import type { JsonObject } from "./contracts";
import type {
  InstituteState,
  InstituteCanon,
  InstituteTruth,
  EpistemicTimeline,
} from "./types";

/**
 * createEmptyInstituteCanon
 *
 * Base canon when the institute boots.
 */
export function createEmptyInstituteCanon(): InstituteCanon {
  return {
    signature: "EMPTY-CANON",
    truths: [],
  };
}

/**
 * createEmptyEpistemicTimeline
 *
 * Base epistemic timeline when the institute boots.
 */
export function createEmptyEpistemicTimeline(): EpistemicTimeline {
  return {
    events: [],
  };
}

/**
 * createEmptyInstituteState
 *
 * Base institute state when MAX‑Institute boots.
 */
export function createEmptyInstituteState(): InstituteState {
  return {
    canon: createEmptyInstituteCanon(),
    timeline: createEmptyEpistemicTimeline(),
  };
}

/**
 * addTruthToCanon
 *
 * Adds a truth to the institute canon.
 */
export function addTruthToCanon(
  canon: InstituteCanon,
  truth: InstituteTruth,
): InstituteCanon {
  return {
    ...canon,
    truths: [...canon.truths, truth],
  };
}

/**
 * appendEpistemicEvent
 *
 * Appends an event to the epistemic timeline.
 */
export function appendEpistemicEvent(
  timeline: EpistemicTimeline,
  event: {
    id: string;
    timestamp: number;
    payload: JsonObject;
  },
): EpistemicTimeline {
  return {
    ...timeline,
    events: [...timeline.events, event],
  };
}

/**
 * toInstituteEnvelope
 *
 * Converts institute state into a public JSON envelope.
 */
export function toInstituteEnvelope(state: InstituteState): JsonObject {
  return {
    ok: true,
    service: "MAX-INSTITUTE",
    canon: state.canon,
    timeline: state.timeline,
  };
}

/**
 * toCanonEnvelope
 *
 * Canon‑only envelope.
 */
export function toCanonEnvelope(canon: InstituteCanon): JsonObject {
  return {
    ok: true,
    service: "MAX-INSTITUTE-CANON",
    canon,
  };
}

/**
 * toTimelineEnvelope
 *
 * Timeline‑only envelope.
 */
export function toTimelineEnvelope(timeline: EpistemicTimeline): JsonObject {
  return {
    ok: true,
    service: "MAX-INSTITUTE-TIMELINE",
    timeline,
  };
}
