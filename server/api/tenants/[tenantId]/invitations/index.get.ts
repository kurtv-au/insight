import { desc } from 'drizzle-orm'

// Pending invitations
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantRole(event, getRouterParam(event, 'tenantId')!, 'admin')

  return useDb()
    .select({
      id: tables.invitations.id,
      email: tables.invitations.email,
      role: tables.invitations.role,
      expiresAt: tables.invitations.expiresAt,
      createdAt: tables.invitations.createdAt
    })
    .from(tables.invitations)
    .where(pendingInvitationsWhere(tenant.id))
    .orderBy(desc(tables.invitations.createdAt))
})
