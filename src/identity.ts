import type { Bindings } from './contracts';
import type { JWTPayload } from 'jose';
import { verifyIdentityToken } from './jwt';

export type IdentityEnvelope = {
  ok: boolean;
  subject: string | null;
  permissions: string[];
  roles: string[];
  claims: JWTPayload | null;
  error?: {
    code: string;
    message: string;
  };
};

/**
 * identityEnvelope
 *
 * Builds a normalized identity view for the OS from a bearer token + env.
 * Used by the /identity route and can be reused by lanes that need identity context.
 */
export async function identityEnvelope(
  token: string | undefined,
  env: Bindings,
): Promise<IdentityEnvelope> {
  const result = await verifyIdentityToken(token, env);

  if (!result.ok) {
    return {
      ok: false,
      subject: null,
      permissions: [],
      roles: [],
      claims: null,
      error: {
        code: result.code,
        message: result.message,
      },
    };
  }

  return {
    ok: true,
    subject: result.subject,
    permissions: result.permissions,
    roles: result.roles,
    claims: result.payload,
  };
}
