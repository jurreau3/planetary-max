import type { Bindings, KernelEnvelope } from './contracts';
import { verifyIdentityJwt } from './jwt';

export async function enforceUmbrella(
  rawBearer: string | undefined,
  env: Bindings,
  lane: string
) {
  const mode = env.UMBRELLA_ENFORCEMENT ?? 'strict';

  // Mode: off → allow everything
  if (mode === 'off') {
    return { ok: true, identity: 'anonymous', session: null };
  }

  // No token → anonymous
  if (!rawBearer) {
    if (mode === 'strict') {
      return { ok: false, code: 'AUTH_REQUIRED', message: 'Bearer token required' };
    }
    return { ok: true, identity: 'anonymous', session: null };
  }

  // Validate JWT
  let payload;
  try {
    payload = await verifyIdentityJwt(rawBearer, env);
  } catch {
    return { ok: false, code: 'INVALID_JWT', message: 'JWT rejected' };
  }

  // Expiration check
  const now = Math.floor(Date.now() / 1000);
  if (payload.exp && payload.exp < now) {
    return { ok: false, code: 'JWT_EXPIRED', message: 'Session expired' };
  }

  // Role-based lane enforcement
  if (lane === 'umbrella') {
    if (!payload.roles?.includes('admin')) {
      return { ok: false, code: 'FORBIDDEN', message: 'Admin role required for umbrella lane' };
    }
  }

  // Windows lane: allow all authenticated users
  // SIM lane: allow all authenticated users
  // Identity lane: always allowed

  return {
    ok: true,
    identity: payload.sub ?? 'unknown',
    session: payload,
  };
}
