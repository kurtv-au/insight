import { and, eq } from 'drizzle-orm'

// The fields the tenant's messages page shows, in order, and the person's own
// choice of which of them are table columns
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  const { user, tenant } = await requireTenantRole(event, tenantId, 'viewer')
  const fields = await visibleMessageFields(tenantId)

  const preference = await useDb().query.userTenantPreferences.findFirst({
    where: and(eq(tables.userTenantPreferences.userId, user.id), eq(tables.userTenantPreferences.tenantId, tenantId))
  })
  const stored = preference?.messageColumns ?? null
  // Only keys of fields that still exist: the setup may have changed since
  const current = new Map(fields.map(field => [canonicalFieldKey(field.fieldKey), field.fieldKey]))
  const mine = stored === null ? null : stored.map(key => current.get(canonicalFieldKey(key))).filter((key): key is string => !!key)

  return {
    fields,
    configured: fields.length > 0,
    canConfigure: user.isPlatformAdmin,
    // null follows the fields' list setting
    mine,
    columns: resolveMessageColumns(fields, stored).map(field => field.fieldKey),
    // Messages share the recordings history setting
    historyDays: tenant.recordingHistoryDays,
    maxRangeDays: MAX_MESSAGE_RANGE_DAYS
  }
})
