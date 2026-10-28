import { z } from 'zod'

const bodySchema = z.object({
  // null goes back to the account's default columns
  columns: recordingColumnsSchema.nullable()
})

// Saves the user's own column choice for this tenant
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  const { user } = await requireRecordingAccess(event, tenantId)
  const { columns } = await readValidatedBody(event, bodySchema.parse)
  const recordingColumns = columns ? normalizeColumns(columns) : null

  await useDb().insert(tables.userTenantPreferences)
    .values({ userId: user.id, tenantId, recordingColumns })
    .onDuplicateKeyUpdate({ set: { recordingColumns, updatedAt: new Date() } })
  return { ok: true }
})
