export type JsonObject = Record<string, unknown>;

export type KernelLane = 'identity' | 'windows' | 'sim' | 'umbrella';

export type KernelEnvelope = {
  id: string;
  lane: KernelLane;
  payload: JsonObject;
  identity: string;
};

export type KernelResult = {
  ok: true;
  lane: KernelLane;
  data: JsonObject;
  meta: { id: string; phase: string };
} | {
  ok: false;
  error: { code: string; message: string };
};

export type KernelService = { fetch(request: Request): Promise<Response> };
export type KernelNamespace = {
  idFromName(name: string): DurableObjectId;
  get(id: DurableObjectId): KernelService;
};

export type Bindings = {
  PORTAL_KERNEL?: KernelNamespace;
  MAXOS_STATE?: KVNamespace;
  IDENTITY_JWT_ISSUER?: string;
  IDENTITY_JWT_AUDIENCE?: string;
  PORTAL_OS_PHASE?: string;
  PLANETARY_MODE?: string;
  MAX_OS_VERSION?: string;
  UMBRELLA_ENFORCEMENT?: string;
  KERNEL_TIMEOUT_MS?: string;
  SUBSTRATE_TIMEOUT_MS?: string;
  MAX_RETRY_ATTEMPTS?: string;
  RETRY_BASE_DELAY_MS?: string;
  CIRCUIT_FAILURE_THRESHOLD?: string;
  CIRCUIT_COOLDOWN_MS?: string;
};

export function isRecord(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asJsonObject(value: unknown): JsonObject {
  return isRecord(value) ? value : {};
}
