import { z } from 'zod'

const querySchema = z.object({
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(50),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  q: z.string().trim().max(50).optional(),
  account: accountNumberSchema.optional(),
  minDuration: z.coerce.number().pipe(z.union([z.literal(0), z.literal(30), z.literal(60), z.literal(300)])).optional(),
  sort: z.enum(RECORDING_COLUMNS).default('timestamp'),
  dir: z.enum(SORT_DIRECTIONS).optional()
})

export default defineEventHandler(async (event) => {
  const { accountNumbers, available } = await requireRecordingAccess(event, getRouterParam(event, 'tenantId')!)
  const query = await getValidatedQuery(event, querySchema.parse)

  // Filters only apply to columns the account can see
  if (query.account && (!available.includes('accountNumber') || !accountNumbers.includes(query.account))) {
    throw createError({ statusCode: 400, message: 'Unknown account number' })
  }
  // Sorting by a hidden field would still reveal something about it
  if (!available.includes(query.sort)) {
    throw createError({ statusCode: 400, message: 'Can’t sort by that column' })
  }

  const { items, total } = await listRecordings({
    accountNumbers,
    from: query.from ? new Date(query.from) : undefined,
    to: query.to ? new Date(query.to) : undefined,
    search: query.q || undefined,
    searchAni: available.includes('ani'),
    searchAgent: available.includes('agent'),
    accountNumber: query.account,
    minDuration: available.includes('duration') ? query.minDuration : undefined,
    sort: query.sort,
    direction: query.dir ?? RECORDING_SORT_DEFAULTS[query.sort],
    offset: (query.page - 1) * query.pageSize,
    limit: query.pageSize
  })

  return { items: items.map(recording => serializeRecording(recording, available)), total }
})
