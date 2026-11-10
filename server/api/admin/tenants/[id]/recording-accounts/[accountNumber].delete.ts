import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  const admin = await requirePlatformAdmin(event)
  const tenantId = getRouterParam(event, 'id')!
  const accountNumber = getRouterParam(event, 'accountNumber')!
  const db = useDb()

  const [result] = await db.delete(tables.tenantRecordingAccounts).where(and(
    eq(tables.tenantRecordingAccounts.tenantId, tenantId),
    eq(tables.tenantRecordingAccounts.accountNumber, accountNumber)
  ))
  if (result.affectedRows === 0) {
    throw createError({ statusCode: 404, message: 'Account number not found' })
  }
  const tenant = await db.query.tenants.findFirst({ where: eq(tables.tenants.id, tenantId) })
  await recordAudit(admin, { action: 'recording_account.removed', tenant, target: accountNumber })
  return { ok: true }
})
