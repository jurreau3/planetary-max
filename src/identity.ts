import { jwtVerify, JWTPayload } from 'jose';
import type { Bindings } from './contracts';

export type IdentityResult =
  | {
      ok: true;
      subject: string;
      payload: JWTPayload;
      permissions: string[];
      roles: string[];
    }
  | { ok: false; code: string; message: string };

const DEFAULT_ISSUER = 'portal-login';
const DEFAULT_AUDIENCE = 'planetary-max';

function hmacKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}

function extractPermissions(payload: JWTPayload): string[] {
  const raw =
    payload.permissions ??
    payload.perms ??
    payload.scope ??
    payload['portal:permissions'];

  if (typeof raw === 'string') {
    return raw.split(/\s+/).filter(Boolean);
  }

  if (Array.isArray(raw)) {
    return raw
      .map((v) => (typeof v === 'string' ? v : ''))
      .filter(Boolean);
  }

  return [];
}

function extractRoles(payload: JWTPayload): string[] {
  const raw = payload.roles ?? payload['portal:roles'];

  if (typeof raw === 'string') {
    return raw.split(/\s+/).filter(Boolean);
  }

  if (Array.isArray(raw)) {
    return raw
      .map((v) => (typeof v === 'string' ? v : ''))
      .filter(Boolean);
  }

  return [];
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
    const { payload } = await jwtVerify(token, key, { issuer, audience });

    const subject =
      typeof payload.sub === 'string' ? payload.sub : 'unknown';

    return {
      ok: true,
      subject,
      payload,
      permissions: extractPermissions(payload),
      roles: extractRoles(payload),
    };
  } catch (error: any) {
    return {
      ok: false,
      code: 'INVALID_TOKEN',
      message: error?.message ?? 'Token verification failed',
    };
  }
}
