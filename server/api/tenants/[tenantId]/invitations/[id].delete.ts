import { and, eq, isNull } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { user, tenant } = await requireTenantRole(event, getRouterParam(event, 'tenantId')!, 'admin')
  const where = and(
    eq(tables.invitations.id, getRouterParam(event, 'id')!),
    eq(tables.invitations.tenantId, tenant.id),
    isNull(tables.invitations.acceptedAt),
    isNull(tables.invitations.revokedAt)
  )

  const db = useDb()
  const invitation = await db.query.invitations.findFirst({ where, columns: { email: true } })
  const [result] = await db.update(tables.invitations)
    .set({ revokedAt: new Date() })
    .where(where)
  if (!invitation || result.affectedRows === 0) {
    throw createError({ statusCode: 404, message: 'Invitation not found' })
  }
  await recordAudit(user, { action: 'invitation.revoked', tenant, target: invitation.email })
  return { ok: true }
})
