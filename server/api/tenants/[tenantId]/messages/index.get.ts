import { eq } from 'drizzle-orm'
import { z } from 'zod'

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
/** Seven calendar days across a DST change are an hour longer */
const MAX_SPAN_MS = MAX_MESSAGE_RANGE_DAYS * DAY_MS + 60 * MINUTE_MS

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  q: z.string().trim().max(100).optional()
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

  // No `to` means up to now (rounded up to the minute, so repeated requests
  // share au-api's cache); no `from` means the week before `to`
  const to = query.to ? new Date(query.to) : new Date(Math.ceil(Date.now() / MINUTE_MS) * MINUTE_MS)
  const requestedFrom = query.from ? new Date(query.from) : new Date(to.getTime() - MAX_MESSAGE_RANGE_DAYS * DAY_MS)
  if (to.getTime() - requestedFrom.getTime() > MAX_SPAN_MS) {
    throw createError({ statusCode: 400, message: `Choose a range of ${MAX_MESSAGE_RANGE_DAYS} days or less` })
  }
  // Nothing before the tenant's history window
  const historyStart = messageHistoryStart(tenant.recordingHistoryDays)
  const from = requestedFrom < historyStart ? historyStart : requestedFrom
  if (to <= from) {
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
    from,
    to,
    q: query.q || undefined,
    offset: (query.page - 1) * query.pageSize,
    limit: query.pageSize
  })
  return { items: items.map(message => serializeMessage(message, fields)), total, mock: source.isMock }
})
