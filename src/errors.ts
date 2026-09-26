//
// Portal‑OS Error Substrate
// Normalized error envelopes for kernel, planetary, and generic API surfaces
//

import type { JsonObject } from "./contracts";

export type PortalError = {
  code: string;
  message: string;
  details?: JsonObject;
};

/**
 * kernelError
 *
 * Normalized error envelope for kernel‑level failures.
 */
export function kernelError(message: string, details?: JsonObject): JsonObject {
  const error: PortalError = {
    code: "KERNEL_ERROR",
    message,
    details,
  };

  return {
    ok: false,
    service: "PORTAL-KERNEL",
    error,
  };
}

/**
 * planetaryError
 *
 * Normalized error envelope for planetary‑level failures.
 */
export function planetaryError(message: string, details?: JsonObject): JsonObject {
  const error: PortalError = {
    code: "PLANETARY_ERROR",
    message,
    details,
  };

  return {
    ok: false,
    service: "PLANETARY-STATE",
    error,
  };
}

/**
 * apiError
 *
 * Generic error envelope for Portal‑OS API surfaces.
 */
export function apiError(service: string, code: string, message: string, details?: JsonObject): JsonObject {
  const error: PortalError = {
    code,
    message,
    details,
  };

  return {
    ok: false,
    service,
    error,
  };
}
