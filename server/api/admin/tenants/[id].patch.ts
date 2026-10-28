import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  name: nameSchema.optional(),
  status: tenantStatusSchema.optional()
})

export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const body = await readValidatedBody(event, bodySchema.parse)

  const [result] = await useDb().update(tables.tenants)
    .set(body)
    .where(eq(tables.tenants.id, getRouterParam(event, 'id')!))
  if (result.affectedRows === 0) {
    throw createError({ statusCode: 404, message: 'Tenant not found' })
  }
  return { ok: true }
})
