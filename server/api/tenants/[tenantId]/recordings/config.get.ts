import { and, eq } from 'drizzle-orm'

// Column settings at every level, plus the account numbers when the user may see them
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  const { user, accountNumbers, available, accountDefault } = await requireRecordingAccess(event, tenantId)

  const preferences = await useDb().query.userTenantPreferences.findFirst({
    where: and(eq(tables.userTenantPreferences.userId, user.id), eq(tables.userTenantPreferences.tenantId, tenantId))
  })
  const mine = preferences?.recordingColumns ? normalizeColumns(preferences.recordingColumns) : null

  return {
    available,
    accountDefault,
    mine,
    columns: resolveColumns(available, accountDefault, mine),
    hasAccountNumbers: accountNumbers.length > 0,
    accountNumbers: available.includes('accountNumber') || user.isPlatformAdmin ? accountNumbers : []
  }
})
