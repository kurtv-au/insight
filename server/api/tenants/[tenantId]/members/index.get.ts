import { asc, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantRole(event, getRouterParam(event, 'tenantId')!, 'admin')

  return useDb()
    .select({
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
    .orderBy(asc(tables.users.name), asc(tables.users.email))
})
