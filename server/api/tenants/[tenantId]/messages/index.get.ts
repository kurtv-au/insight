import { eq } from 'drizzle-orm'
import { z } from 'zod'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  q: z.string().trim().max(100).optional(),
  // Development only: generated sample rows. Ignored in production.
  mock: z.enum(['1']).optional()
})

export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  await requireTenantRole(event, tenantId, 'viewer')
  const query = await getValidatedQuery(event, querySchema.parse)

  const fields = await visibleMessageFields(tenantId)
  if (!fields.length) {
    return { items: [] as MessageRow[], total: 0, mock: false }
  }

  const from = query.from ? new Date(query.from) : undefined
  const to = query.to ? new Date(query.to) : undefined
  if (from && to && to <= from) {
    return { items: [] as MessageRow[], total: 0, mock: false }
  }

  const accounts = await useDb().query.tenantRecordingAccounts.findMany({
    where: eq(tables.tenantRecordingAccounts.tenantId, tenantId)
  })
  const source = messageSource({ mock: query.mock === '1' })
  const { items, total } = await source.list({
    tenantId,
    accountNumbers: accounts.map(account => account.accountNumber),
    fields,
    from,
    to,
    q: query.q || undefined,
    offset: (query.page - 1) * query.pageSize,
    limit: query.pageSize
  })
  return { items: items.map(message => serializeMessage(message, fields)), total, mock: source.isMock }
})
