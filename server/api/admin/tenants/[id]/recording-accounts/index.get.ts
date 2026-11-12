import { asc, eq } from 'drizzle-orm'

// The account numbers connected to a tenant. Its messages and recordings both
// come from these, so they're listed whatever the plan includes.
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const tenantId = getRouterParam(event, 'id')!
  const db = useDb()

  const tenant = await db.query.tenants.findFirst({ where: eq(tables.tenants.id, tenantId) })
  if (!tenant) {
    throw createError({ statusCode: 404, message: 'Tenant not found' })
  }

  const accounts = await db.query.tenantRecordingAccounts.findMany({
    where: eq(tables.tenantRecordingAccounts.tenantId, tenantId),
    orderBy: asc(tables.tenantRecordingAccounts.accountNumber)
  })
  return { accountNumbers: accounts.map(account => account.accountNumber) }
})
