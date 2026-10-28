import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  name: nameSchema.optional(),
  status: tenantStatusSchema.optional(),
  // Recording columns the account can use; timestamp is always included
  recordingColumns: recordingColumnsSchema.optional()
})

export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const { recordingColumns, ...body } = await readValidatedBody(event, bodySchema.parse)

  const [result] = await useDb().update(tables.tenants)
    .set({ ...body, ...(recordingColumns && { recordingColumns: normalizeColumns(recordingColumns) }) })
    .where(eq(tables.tenants.id, getRouterParam(event, 'id')!))
  if (result.affectedRows === 0) {
    throw createError({ statusCode: 404, message: 'Tenant not found' })
  }
  return { ok: true }
})
