import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { tenantId, targetUserId, actor, tenant, isSelfRemoval } = await requireManageableMember(event)

  await useDb().delete(tables.memberships)
    .where(and(eq(tables.memberships.tenantId, tenantId), eq(tables.memberships.userId, targetUserId)))
  await recordAudit(actor, {
    action: 'member.removed',
    tenant,
    target: await memberEmail(targetUserId),
    details: { self: isSelfRemoval }
  })
  return { ok: true }
})
