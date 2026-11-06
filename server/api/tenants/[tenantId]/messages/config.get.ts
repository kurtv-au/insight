// The fields the tenant's messages page shows, in order
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  const { user, tenant } = await requireTenantRole(event, tenantId, 'viewer')
  const fields = await visibleMessageFields(tenantId)
  return {
    fields,
    configured: fields.length > 0,
    canConfigure: user.isPlatformAdmin,
    // Messages share the recordings history setting
    historyDays: tenant.recordingHistoryDays,
    maxRangeDays: MAX_MESSAGE_RANGE_DAYS
  }
})
