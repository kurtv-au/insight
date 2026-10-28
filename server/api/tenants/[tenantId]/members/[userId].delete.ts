import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const { tenantId, targetUserId } = await requireManageableMember(event)

  await useDb().delete(tables.memberships)
    .where(and(eq(tables.memberships.tenantId, tenantId), eq(tables.memberships.userId, targetUserId)))
  return { ok: true }
})
