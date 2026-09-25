// ------------------------------------------------------------
// Bindings — Cloudflare Worker environment
// ------------------------------------------------------------
export type Bindings = {
  // Durable Objects
  PORTAL_KERNEL: DurableObjectNamespace;

  // State storage
  MAXOS_STATE?: KVNamespace;

  // Identity / JWT
  IDENTITY_JWT_SECRET?: string;
  IDENTITY_JWT_ISSUER?: string;
  IDENTITY_JWT_AUDIENCE?: string;

  // OS / Portal config
  PORTAL_OS_PHASE?: string;
  PLANETARY_MODE?: string;
  MAX_OS_VERSION?: string;
  UMBRELLA_ENFORCEMENT?: string;
};

// ------------------------------------------------------------
// Kernel lanes
// ------------------------------------------------------------
export type KernelLane =
  | 'identity'
  | 'windows'
  | 'sim'
  | 'umbrella';

// ------------------------------------------------------------
// Kernel envelope — message into PortalKernel DO
// ------------------------------------------------------------
export type KernelEnvelope = {
  id: string;
  lane: KernelLane;
  payload: JsonObject;
  identity: string;
};

// ------------------------------------------------------------
// JSON contracts
// ------------------------------------------------------------
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonObject
  | JsonValue[];

export type JsonObject = {
  [key: string]: JsonValue;
};

export function asJsonObject(value: unknown): JsonObject {
  if (!value || typeof value !== 'object') {
    return {};
  }

  if (Array.isArray(value)) {
    return {};
  }

  return value as JsonObject;
}
