import { asc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantRole(event, getRouterParam(event, 'tenantId')!, 'admin')
  const db = useDb()

  const [members, assignments] = await Promise.all([
    db.select({
      userId: tables.users.id,
      email: tables.users.email,
      name: tables.users.name,
      role: tables.memberships.role,
      joinedAt: tables.memberships.createdAt,
      lastLoginAt: tables.users.lastLoginAt
    })
      .from(tables.memberships)
      .innerJoin(tables.users, eq(tables.users.id, tables.memberships.userId))
      .where(eq(tables.memberships.tenantId, tenant.id))
      .orderBy(asc(tables.users.name), asc(tables.users.email)),
    db.select({ userId: tables.membershipMessageFilters.userId, filterId: tables.membershipMessageFilters.filterId })
      .from(tables.membershipMessageFilters)
      .where(eq(tables.membershipMessageFilters.tenantId, tenant.id))
  ])

  // The message filters each member sees messages through; none means every message
  const filterIds = new Map<string, string[]>()
  for (const { userId, filterId } of assignments) {
    filterIds.set(userId, [...filterIds.get(userId) ?? [], filterId])
  }
  return members.map(member => ({ ...member, filterIds: filterIds.get(member.userId) ?? [] }))
})
