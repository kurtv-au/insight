import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  timezone: timezoneSchema
})

// Account settings that owners and admins can change
export default defineEventHandler(async (event) => {
  const { tenant } = await requireTenantRole(event, getRouterParam(event, 'tenantId')!, 'admin')
  const { timezone } = await readValidatedBody(event, bodySchema.parse)

  await useDb().update(tables.tenants).set({ timezone }).where(eq(tables.tenants.id, tenant.id))
  return { ok: true }
})
