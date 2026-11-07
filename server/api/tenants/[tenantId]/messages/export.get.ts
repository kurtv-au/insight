import { eq } from 'drizzle-orm'

const querySchema = messageRangeQuerySchema.extend({
  /** The viewer's timezone, so times in the file match the page */
  tz: timezoneSchema.optional()
})

/**
 * Every message matching the messages page's filters (date range and search,
 * across all pages) as a CSV download. Same access, range rules and visible
 * fields as the list: hidden fields never leave, as on the page.
 */
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  const { user, tenant } = await requireTenantRole(event, tenantId, 'viewer')
  const query = await getValidatedQuery(event, querySchema.parse)
  await rateLimit(`messages-export:${user.id}`, 30, 60 * 60)

  const timeZone = query.tz ?? tenant.timezone
  const [fields, receivedSetting] = await Promise.all([visibleMessageFields(tenantId), messageReceivedSetting(tenantId)])
  const range = fields.length ? resolveMessageRange(query, tenant.recordingHistoryDays) : null

  const rows: MessageRow[] = []
  if (range) {
    const accounts = await useDb().query.tenantRecordingAccounts.findMany({
      where: eq(tables.tenantRecordingAccounts.tenantId, tenantId)
    })
    const source = messageSource()
    const base = { tenantId, accountNumbers: accounts.map(account => account.accountNumber), fields, ...range, q: query.q || undefined }

    let total = Infinity
    for (let offset = 0; offset < total; offset += EXPORT_PAGE_SIZE) {
      const page = await source.list({ ...base, offset, limit: EXPORT_PAGE_SIZE })
      total = page.total
      if (total > MAX_EXPORT_MESSAGES) {
        throw createError({
          statusCode: 400,
          message: `That’s ${total.toLocaleString('en-US')} messages, more than the ${MAX_EXPORT_MESSAGES.toLocaleString('en-US')} an export can hold. Choose a shorter range or search.`
        })
      }
      rows.push(...page.items.map(message => serializeMessage(message, fields)))
      if (!page.items.length) {
        break
      }
    }
  }

  const days = range
    ? `${exportDate(range.from, timeZone)}-to-${exportDate(new Date(range.to.getTime() - 1), timeZone)}`
    : exportDate(new Date(), timeZone)
  setResponseHeaders(event, {
    'Content-Type': 'text/csv; charset=utf-8',
    'Content-Disposition': `attachment; filename="${tenant.slug}-messages-${days}.csv"`,
    // Customer data: never kept by a browser or proxy cache
    'Cache-Control': 'no-store'
  })
  // An account that doesn't show when messages were received doesn't export it either
  return toCsv(messagesToCsvRows(rows, fields, timeZone, { received: receivedAvailable(receivedSetting) }))
})
