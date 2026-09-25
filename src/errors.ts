import type { JsonObject } from './contracts';

/**
 * PortalOsErrorCode
 *
 * Unified error codes for Portal‑OS.
 */
export type PortalOsErrorCode =
  | 'INVALID_METHOD'
  | 'INVALID_ENVELOPE'
  | 'INVALID_LANE'
  | 'WINDOWS_INVALID_ACTION'
  | 'IDENTITY_INVALID'
  | 'IDENTITY_REQUIRED'
  | 'ROLE_FORBIDDEN'
  | 'ROLE_REQUIRED'
  | 'PERMISSION_DENIED'
  | 'LANE_INVALID'
  | 'PLANETARY_INCONSISTENT'
  | 'KERNEL_FAILURE'
  | 'UNKNOWN';

/**
 * PortalOsError
 *
 * Standardized OS error shape.
 */
export type PortalOsError = {
  ok: false;
  error: {
    code: PortalOsErrorCode;
    message: string;
    details?: JsonObject;
  };
};

/**
 * makeError
 *
 * Creates a standardized Portal‑OS error envelope.
 */
export function makeError(
  code: PortalOsErrorCode,
  message: string,
  details?: JsonObject
): PortalOsError {
  return {
    ok: false,
    error: {
      code,
      message,
      details,
    },
  };
}

/**
 * kernelError
 *
 * Wraps kernel‑level failures into a Portal‑OS error envelope.
 */
export function kernelError(
  message: string,
  details?: JsonObject
): PortalOsError {
  return makeError('KERNEL_FAILURE', message, details);
}

/**
 * unknownError
 *
 * Fallback for unexpected exceptions.
 */
export function unknownError(
  message: string = 'An unknown error occurred',
  details?: JsonObject
): PortalOsError {
  return makeError('UNKNOWN', message, details);
}
