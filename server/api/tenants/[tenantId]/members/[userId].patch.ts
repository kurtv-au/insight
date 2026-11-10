import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  role: roleSchema
})

export default defineEventHandler(async (event) => {
  const { role } = await readValidatedBody(event, bodySchema.parse)
  const { tenantId, targetUserId, target, actor, tenant } = await requireManageableMember(event, { newRole: role })

  await useDb().update(tables.memberships)
    .set({ role })
    .where(and(eq(tables.memberships.tenantId, tenantId), eq(tables.memberships.userId, targetUserId)))
  if (target.role !== role) {
    await recordAudit(actor, {
      action: 'member.role_changed',
      tenant,
      target: await memberEmail(targetUserId),
      details: { from: target.role, to: role }
    })
  }
  return { ok: true }
})
