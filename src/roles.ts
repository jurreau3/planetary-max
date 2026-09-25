export const RoleRoutes = {
  admin: [
    'identity',
    'windows',
    'sim',
    'umbrella',
    'portal',
    'kernel'
  ],

  operator: [
    'identity',
    'windows',
    'portal'
  ],

  viewer: [
    'identity',
    'sim'
  ],

  anonymous: [
    'identity'
  ]
} as const;

export function roleAllows(role: string, lane: string): boolean {
  const allowed = RoleRoutes[role] ?? RoleRoutes['anonymous'];
  return allowed.includes(lane);
}
