import { and, eq } from 'drizzle-orm'

export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const [result] = await useDb().delete(tables.tenantRecordingAccounts).where(and(
    eq(tables.tenantRecordingAccounts.tenantId, getRouterParam(event, 'id')!),
    eq(tables.tenantRecordingAccounts.accountNumber, getRouterParam(event, 'accountNumber')!)
  ))
  if (result.affectedRows === 0) {
    throw createError({ statusCode: 404, message: 'Account number not found' })
  }
  return { ok: true }
})
