//
// Portal‑OS Identity Substrate
// JWT → Identity Envelope
//

import type { Bindings, JsonObject } from "./contracts";
import { kernelError } from "./errors";
import { verifyJwt } from "./jwt";

export type IdentityEnvelope =
  | {
      ok: true;
      identity: JsonObject;
    }
  | {
      ok: false;
      error: JsonObject;
    };

/**
 * identityEnvelope
 *
 * Verifies the JWT and returns a normalized identity envelope.
 */
export async function identityEnvelope(
  token: string | undefined,
  env: Bindings
): Promise<IdentityEnvelope> {
  if (!env.JWT_SECRET) {
    return {
      ok: false,
      error: kernelError("IDENTITY_CONFIG_MISSING", {
        message: "JWT_SECRET is not configured in environment",
      }),
    };
  }

  const result = await verifyJwt(token, env.JWT_SECRET);

  if (!result.ok) {
    return {
      ok: false,
      error: result.error,
    };
  }

  return {
    ok: true,
    identity: result.payload,
  };
}
