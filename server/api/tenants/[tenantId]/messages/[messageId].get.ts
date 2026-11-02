import { eq } from 'drizzle-orm'
import { z } from 'zod'

const querySchema = z.object({
  mock: z.enum(['1']).optional()
})

// One message, for a deep link to the detail drawer
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  await requireTenantRole(event, tenantId, 'viewer')
  const query = await getValidatedQuery(event, querySchema.parse)

  const fields = await visibleMessageFields(tenantId)
  const accounts = await useDb().query.tenantRecordingAccounts.findMany({
    where: eq(tables.tenantRecordingAccounts.tenantId, tenantId)
  })
  const message = fields.length
    ? await messageSource({ mock: query.mock === '1' }).get(getRouterParam(event, 'messageId')!, {
        tenantId,
        accountNumbers: accounts.map(account => account.accountNumber),
        fields
      })
    : null
  if (!message) {
    throw createError({ statusCode: 404, message: 'Message not found' })
  }
  return serializeMessage(message, fields)
})
