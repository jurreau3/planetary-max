import type { Bindings } from './contracts';
import { verifyIdentityJwt } from './jwt';

/**
 * identityEnvelope
 *
 * Produces a coherent identity + session object from a Bearer JWT.
 * - anonymous → no token
 * - invalid   → token rejected (bad signature, issuer, audience, expired)
 * - ok:true   → validated identity + session payload
 */
export async function identityEnvelope(
  bearer: string | undefined,
  env: Bindings
) {
  // No Authorization header → anonymous identity
  if (!bearer) {
    return {
      ok: false,
      identity: 'anonymous',
      session: null,
    };
  }

  try {
    // Validate JWT using issuer, audience, and HMAC secret
    const payload = await verifyIdentityJwt(bearer, env);

    return {
      ok: true,
      identity: payload.sub ?? 'unknown',
      session: {
        sub: payload.sub,
        email: payload.email,
        roles: payload.roles ?? [],
        issuedAt: payload.iat,
        expiresAt: payload.exp,
      },
    };
  } catch {
    // Token present but invalid → identity: invalid
    return {
      ok: false,
      identity: 'invalid',
      session: null,
    };
  }
}
