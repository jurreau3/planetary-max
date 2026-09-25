export type Role =
  | 'admin'
  | 'operator'
  | 'viewer'
  | 'anonymous';

export type Lane =
  | 'identity'
  | 'windows'
  | 'sim'
  | 'umbrella'
  | 'portal'
  | 'kernel';

const RoleRoutes: Record<Role, Lane[]> = {
  admin: ['identity', 'windows', 'sim', 'umbrella', 'portal', 'kernel'],
  operator: ['identity', 'windows', 'portal'],
  viewer: ['identity', 'sim'],
  anonymous: ['identity'],
};

export function roleAllows(role: string, lane: string): boolean {
  const normalizedRole: Role =
    role === 'admin' ||
    role === 'operator' ||
    role === 'viewer' ||
    role === 'anonymous'
      ? role
      : 'anonymous';

  const normalizedLane: Lane | null =
    lane === 'identity' ||
    lane === 'windows' ||
    lane === 'sim' ||
    lane === 'umbrella' ||
    lane === 'portal' ||
    lane === 'kernel'
      ? (lane as Lane)
      : null;

  if (!normalizedLane) return false;

  const allowed = RoleRoutes[normalizedRole];
  return allowed.includes(normalizedLane);
}
