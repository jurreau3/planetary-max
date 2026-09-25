import { jwtVerify, JWTPayload } from 'jose';
import type { Bindings } from './contracts';

export type IdentityResult =
  | { ok: true; subject: string; payload: JWTPayload }
  | { ok: false; code: string; message: string };

const DEFAULT_ISSUER = 'portal-login';
const DEFAULT_AUDIENCE = 'planetary-max';

function hmacKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

export async function verifyIdentityToken(
  token: string | undefined,
  env: Bindings,
): Promise<IdentityResult> {
  if (!token) {
    return {
      ok: false,
      code: 'MISSING_TOKEN',
      message: 'Authorization token is required',
    };
  }

  const secret = env.IDENTITY_JWT_SECRET;
  if (!secret) {
    return {
      ok: false,
      code: 'MISSING_SECRET',
      message: 'IDENTITY_JWT_SECRET is not configured',
    };
  }

  const issuer = env.IDENTITY_JWT_ISSUER ?? DEFAULT_ISSUER;
  const audience = env.IDENTITY_JWT_AUDIENCE ?? DEFAULT_AUDIENCE;

  try {
    const key = hmacKey(secret);

    const { payload } = await jwtVerify(token, key, {
      issuer,
      audience,
    });

    const subject =
      typeof payload.sub === 'string' ? payload.sub : 'unknown';

    return {
      ok: true,
      subject,
      payload,
    };
  } catch (error: any) {
    return {
      ok: false,
      code: 'INVALID_TOKEN',
      message: error?.message ?? 'Token verification failed',
    };
  }
}
