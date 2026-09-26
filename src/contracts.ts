//
// Portal‑OS Contracts Substrate
// Bindings, Env, and JSON envelope types
//

export type JsonObject = Record<string, unknown>;

/**
 * Bindings
 *
 * Worker environment bindings for Portal‑OS.
 */
export type Bindings = {
  PORTAL_KERNEL: DurableObjectNamespace;
  UMBRELLA_ENFORCEMENT: string;
  PORTAL_OS_VERSION?: string;
  PORTAL_PLANETARY_MODE?: 'single' | 'planetary';
};

/**
 * Env
 *
 * Durable Object environment view.
 * Mirrors the relevant parts of Bindings.
 */
export type Env = {
  PORTAL_OS_VERSION?: string;
  PORTAL_PLANETARY_MODE?: 'single' | 'planetary';
};
