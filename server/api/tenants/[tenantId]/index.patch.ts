import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  timezone: timezoneSchema.optional(),
  // null shows every available column
  recordingDefaultColumns: recordingColumnsSchema.nullable().optional()
})

// Account settings that owners and admins can change
export default defineEventHandler(async (event) => {
  const { user, tenant } = await requireTenantRole(event, getRouterParam(event, 'tenantId')!, 'admin')
  const body = await readValidatedBody(event, bodySchema.parse)

  const changes: Partial<typeof tables.tenants.$inferInsert> = {}
  if (body.timezone) {
    changes.timezone = body.timezone
  }
  if (body.recordingDefaultColumns !== undefined) {
    // Only columns the account has available
    const available = tenant.recordingColumns ?? DEFAULT_AVAILABLE_COLUMNS
    changes.recordingDefaultColumns = body.recordingDefaultColumns
      ? normalizeColumns(body.recordingDefaultColumns.filter(column => available.includes(column)))
      : null
  }
  if (Object.keys(changes).length) {
    await useDb().update(tables.tenants).set(changes).where(eq(tables.tenants.id, tenant.id))
    const changed = auditChanges(tenant, changes)
    if (Object.keys(changed).length) {
      await recordAudit(user, { action: 'account.settings_changed', tenant, details: { changes: changed } })
    }
  }
  return { ok: true }
})
