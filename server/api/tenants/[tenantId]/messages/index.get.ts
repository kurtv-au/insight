import { eq } from 'drizzle-orm'
import { z } from 'zod'

const querySchema = messageRangeQuerySchema.extend({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50)
})

export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  const { tenant } = await requireTenantRole(event, tenantId, 'viewer')
  const query = await getValidatedQuery(event, querySchema.parse)
  const empty = { items: [] as MessageRow[], total: 0, mock: false }

  const fields = await visibleMessageFields(tenantId)
  if (!fields.length) {
    return empty
  }

  const range = resolveMessageRange(query, tenant.recordingHistoryDays)
  if (!range) {
    return empty
  }

  const accounts = await useDb().query.tenantRecordingAccounts.findMany({
    where: eq(tables.tenantRecordingAccounts.tenantId, tenantId)
  })
  const source = messageSource()
  const { items, total } = await source.list({
    tenantId,
    accountNumbers: accounts.map(account => account.accountNumber),
    fields,
    ...range,
    q: query.q || undefined,
    offset: (query.page - 1) * query.pageSize,
    limit: query.pageSize
  })
  return { items: items.map(message => serializeMessage(message, fields)), total, mock: source.isMock }
})
