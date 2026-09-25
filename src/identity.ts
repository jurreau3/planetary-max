//
// Portal‑OS Identity Substrate
// JWT envelope + auth context
//

import type { Bindings } from "./contracts";

export type IdentityEnvelope = {
  ok: boolean;
  subject?: string;
  roles?: string[];
  claims?: Record<string, unknown>;
};

export type AuthContext = {
  identity: IdentityEnvelope;
};

/**
 * identityEnvelope
 *
 * Normalizes the raw authorization token into a stable identity envelope.
 * This is intentionally minimal; real JWT verification can be plugged in later.
 */
export async function identityEnvelope(
  token: string | undefined,
  env: Bindings,
): Promise<IdentityEnvelope> {
  if (!token) {
    return { ok: false };
  }

  // Placeholder: treat any non-empty token as valid.
  // In a real system, you would verify the JWT here using env secrets.
  return {
    ok: true,
    subject: token,
    roles: [],
    claims: {},
  };
}

/**
 * requireAuth
 *
 * Throws if identity is not valid. Used by introspection and governance layers.
 */
export function requireAuth(ctx: AuthContext): void {
  if (!ctx.identity.ok) {
    throw new Error("AUTH_REQUIRED");
  }
}
