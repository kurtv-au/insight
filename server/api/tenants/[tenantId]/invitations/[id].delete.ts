import { and, eq, isNull } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantRole(event, getRouterParam(event, 'tenantId')!, 'admin')

  const [result] = await useDb().update(tables.invitations)
    .set({ revokedAt: new Date() })
    .where(and(
      eq(tables.invitations.id, getRouterParam(event, 'id')!),
      eq(tables.invitations.tenantId, tenant.id),
      isNull(tables.invitations.acceptedAt),
      isNull(tables.invitations.revokedAt)
    ))
  if (result.affectedRows === 0) {
    throw createError({ statusCode: 404, message: 'Invitation not found' })
  }
  return { ok: true }
})
