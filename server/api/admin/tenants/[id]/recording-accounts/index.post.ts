import { eq } from 'drizzle-orm'
import { z } from 'zod'

const bodySchema = z.object({
  accountNumber: accountNumberSchema
})

// Connects an account number so its recordings appear in the tenant
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const tenantId = getRouterParam(event, 'id')!
  const { accountNumber } = await readValidatedBody(event, bodySchema.parse)
  const db = useDb()

  if (!await db.query.tenants.findFirst({ where: eq(tables.tenants.id, tenantId) })) {
    throw createError({ statusCode: 404, message: 'Tenant not found' })
  }

  const existing = await db.query.tenantRecordingAccounts.findFirst({
    where: eq(tables.tenantRecordingAccounts.accountNumber, accountNumber),
    with: { tenant: true }
  })
  if (existing) {
    throw createError({
      statusCode: 409,
      message: existing.tenantId === tenantId
        ? `${accountNumber} is already connected to this account`
        : `${accountNumber} is already connected to ${existing.tenant.name}`
    })
  }

  await db.insert(tables.tenantRecordingAccounts).values({ accountNumber, tenantId })
  return { ok: true }
})
