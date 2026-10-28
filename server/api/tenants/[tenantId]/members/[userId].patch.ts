import { and, eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  role: roleSchema
})

export default defineEventHandler(async (event) => {
  const { role } = await readValidatedBody(event, bodySchema.parse)
  const { tenantId, targetUserId } = await requireManageableMember(event, { newRole: role })

  await useDb().update(tables.memberships)
    .set({ role })
    .where(and(eq(tables.memberships.tenantId, tenantId), eq(tables.memberships.userId, targetUserId)))
  return { ok: true }
})
