export const ROLES = ['owner', 'admin', 'viewer'] as const
export type Role = typeof ROLES[number]

const ROLE_RANK: Record<Role, number> = {
  owner: 3,
  admin: 2,
  viewer: 1
}

/** Whether `role` grants at least the permissions of `minRole` */
export function hasRole(role: Role | null | undefined, minRole: Role) {
  return !!role && ROLE_RANK[role] >= ROLE_RANK[minRole]
}
