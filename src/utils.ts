//
// Portal‑OS Utility Substrate
//

import type { JsonObject } from "./contracts";

/**
 * nowTick
 *
 * Returns a monotonic-ish tick based on current time.
 */
export function nowTick(): number {
  return Date.now();
}

/**
 * cloneJson
 *
 * Deep‑clones a JSON‑serializable value.
 */
export function cloneJson<T extends JsonObject | unknown>(value: T): T {
  return JSON.parse(JSON.stringify(value));
}

