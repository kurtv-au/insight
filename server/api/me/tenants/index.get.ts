import { asc, eq } from 'drizzle-orm'

// Tenants the current user is a member of
export default defineEventHandler(async (event) => {
  const user = await requireUser(event)

  return useDb()
    .select({
      id: tables.tenants.id,
      slug: tables.tenants.slug,
      name: tables.tenants.name,
      status: tables.tenants.status,
      role: tables.memberships.role
    })
    .from(tables.memberships)
    .innerJoin(tables.tenants, eq(tables.tenants.id, tables.memberships.tenantId))
    .where(eq(tables.memberships.userId, user.id))
    .orderBy(asc(tables.tenants.name))
})
