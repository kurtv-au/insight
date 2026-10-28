import { and, asc, count, eq, gt, isNull, sql } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const db = useDb()

  const pendingOwnerInvites = db
    .select({ tenantId: tables.invitations.tenantId, count: count().as('pending_owner_invites') })
    .from(tables.invitations)
    .where(and(
      eq(tables.invitations.role, 'owner'),
      isNull(tables.invitations.acceptedAt),
      isNull(tables.invitations.revokedAt),
      gt(tables.invitations.expiresAt, new Date())
    ))
    .groupBy(tables.invitations.tenantId)
    .as('pending')

  return db
    .select({
      id: tables.tenants.id,
      slug: tables.tenants.slug,
      name: tables.tenants.name,
      status: tables.tenants.status,
      createdAt: tables.tenants.createdAt,
      memberCount: count(tables.memberships.userId),
      ownerCount: sql<number>`cast(coalesce(sum(${tables.memberships.role} = 'owner'), 0) as unsigned)`.mapWith(Number),
      pendingOwnerInvites: sql<number>`coalesce(max(${pendingOwnerInvites.count}), 0)`.mapWith(Number)
    })
    .from(tables.tenants)
    .leftJoin(tables.memberships, eq(tables.memberships.tenantId, tables.tenants.id))
    .leftJoin(pendingOwnerInvites, eq(pendingOwnerInvites.tenantId, tables.tenants.id))
    .groupBy(tables.tenants.id)
    .orderBy(asc(tables.tenants.name))
})
