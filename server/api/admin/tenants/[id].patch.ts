import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  name: nameSchema.optional(),
  status: tenantStatusSchema.optional(),
  plan: planSchema.optional(),
  // Recording columns the account can use; timestamp is always included
  recordingColumns: recordingColumnsSchema.optional(),
  // Days of recordings the account can load
  recordingHistoryDays: recordingHistoryDaysSchema.optional()
})

export default defineEventHandler(async (event) => {
  const admin = await requirePlatformAdmin(event)
  const { recordingColumns, ...body } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  const tenant = await db.query.tenants.findFirst({ where: eq(tables.tenants.id, getRouterParam(event, 'id')!) })
  if (!tenant) {
    throw createError({ statusCode: 404, message: 'Tenant not found' })
  }
  const changes = { ...body, ...(recordingColumns && { recordingColumns: normalizeColumns(recordingColumns) }) }
  if (Object.keys(changes).length) {
    await db.update(tables.tenants).set(changes).where(eq(tables.tenants.id, tenant.id))
  }

  const changed = auditChanges(tenant, changes)
  if (Object.keys(changed).length) {
    await recordAudit(admin, { action: 'tenant.updated', tenant: { id: tenant.id, name: changes.name ?? tenant.name }, details: { changes: changed } })
  }
  return { ok: true }
})
