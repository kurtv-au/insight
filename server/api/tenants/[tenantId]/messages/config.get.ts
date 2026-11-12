import { and, eq } from 'drizzle-orm'

// The fields the tenant's messages page shows, in order, and the person's own
// choice of which of them are table columns
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  const { user, historyDays } = await requireMessageAccess(event, tenantId)
  const [fields, receivedSetting, filters] = await Promise.all([
    visibleMessageFields(tenantId),
    messageReceivedSetting(tenantId),
    memberMessageFilters(tenantId, user)
  ])

  const preference = await useDb().query.userTenantPreferences.findFirst({
    where: and(eq(tables.userTenantPreferences.userId, user.id), eq(tables.userTenantPreferences.tenantId, tenantId))
  })
  const stored = splitMessageColumns(preference?.messageColumns ?? null)
  // Only keys of fields that still exist: the setup may have changed since
  const current = new Map(fields.map(field => [canonicalFieldKey(field.fieldKey), field.fieldKey]))
  const mine = stored.fields === null ? null : stored.fields.map(key => current.get(canonicalFieldKey(key))).filter((key): key is string => !!key)
  let columns = resolveMessageColumns(fields, stored.fields).map(field => field.fieldKey)
  let received = resolveReceived(receivedSetting, stored.received)
  // Never an empty table: fall back to the account's default columns
  if (!columns.length && !received) {
    columns = resolveMessageColumns(fields, null).map(field => field.fieldKey)
    received = resolveReceived(receivedSetting, null)
  }

  return {
    fields,
    configured: fields.length > 0,
    canConfigure: user.isPlatformAdmin,
    // null follows the fields' list setting
    mine,
    columns,
    received,
    // How the account shows when a message was received (both off: nowhere)
    receivedSetting: { ...receivedSetting, available: receivedAvailable(receivedSetting) },
    // The person's message filters, by name: they see only messages matching one
    filters: filters.map(filter => filter.name),
    // Messages share the plan's history window with recordings
    historyDays,
    maxRangeDays: MAX_MESSAGE_RANGE_DAYS
  }
})
