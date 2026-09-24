export type IdentityEnvelope = {
  ok: true;
  issuer: string;
  audience: string;
  id: string;
  signature: string;
};

const DEFAULT_ISSUER = 'portal-login';
const DEFAULT_AUDIENCE = 'planetary-max';

export function identityEnvelope(
  token: string | undefined,
  env: { IDENTITY_JWT_ISSUER?: string; IDENTITY_JWT_AUDIENCE?: string },
): IdentityEnvelope {
  const issuer = env.IDENTITY_JWT_ISSUER ?? DEFAULT_ISSUER;
  const audience = env.IDENTITY_JWT_AUDIENCE ?? DEFAULT_AUDIENCE;
  const parts = token?.split('.') ?? [];
  let claims: Record<string, unknown> = {};
  if (parts.length === 3) {
    try {
      const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const decoded = atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='));
      const parsed: unknown = JSON.parse(decoded);
      if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
        claims = parsed as Record<string, unknown>;
      }
    } catch {
      claims = {};
    }
  }
  const id = typeof claims.sub === 'string' && claims.sub.trim() !== ''
    ? claims.sub
    : 'anonymous';
  const signature = parts.length === 3 && parts[2] !== '' ? parts[2] : 'unsigned';
  return { ok: true, issuer, audience, id, signature };
}

export function validateIdentityClaims(
  token: string | undefined,
  env: { IDENTITY_JWT_ISSUER?: string; IDENTITY_JWT_AUDIENCE?: string },
): boolean {
  if (!token) return false;
  const parts = token.split('.');
  if (parts.length !== 3 || parts[2] === '') return false;
  try {
    const encoded = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const claims = JSON.parse(atob(encoded.padEnd(Math.ceil(encoded.length / 4) * 4, '='))) as Record<string, unknown>;
    const issuer = env.IDENTITY_JWT_ISSUER ?? DEFAULT_ISSUER;
    const audience = env.IDENTITY_JWT_AUDIENCE ?? DEFAULT_AUDIENCE;
    return claims.iss === issuer && claims.aud === audience;
  } catch {
    return false;
  }
}
