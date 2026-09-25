import type { IdentityResult } from './jwt';

export type PermissionCheck =
  | { ok: true }
  | { ok: false; code: string; message: string };

/**
 * Require a single permission.
 * Example: requirePermission(identity, "windows:open")
 */
export function requirePermission(
  identity: IdentityResult,
  needed: string,
): PermissionCheck {
  if (!identity.ok) {
    return {
      ok: false,
      code: 'UNAUTHENTICATED',
      message: 'Valid identity is required',
    };
  }

  if (!identity.permissions.includes(needed)) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: `Missing required permission: ${needed}`,
    };
  }

  return { ok: true };
}

/**
 * Require at least one permission from a list.
 * Example: requireAnyPermission(identity, ["portal:open", "portal:manage"])
 */
export function requireAnyPermission(
  identity: IdentityResult,
  needed: string[],
): PermissionCheck {
  if (!identity.ok) {
    return {
      ok: false,
      code: 'UNAUTHENTICATED',
      message: 'Valid identity is required',
    };
  }

  const has = needed.some((p) => identity.permissions.includes(p));
  if (!has) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: `Requires one of: ${needed.join(', ')}`,
    };
  }

  return { ok: true };
}

/**
 * Require ALL permissions in a list.
 * Example: requireAllPermissions(identity, ["windows:open", "windows:focus"])
 */
export function requireAllPermissions(
  identity: IdentityResult,
  needed: string[],
): PermissionCheck {
  if (!identity.ok) {
    return {
      ok: false,
      code: 'UNAUTHENTICATED',
      message: 'Valid identity is required',
    };
  }

  const missing = needed.filter((p) => !identity.permissions.includes(p));
  if (missing.length > 0) {
    return {
      ok: false,
      code: 'FORBIDDEN',
      message: `Missing required permissions: ${missing.join(', ')}`,
    };
  }

  return { ok: true };
}
