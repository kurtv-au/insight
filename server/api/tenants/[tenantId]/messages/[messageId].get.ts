import { eq } from 'drizzle-orm'
// One message, for a deep link to the detail drawer. Only the tenant's own
// account numbers, history window and the person's message filters count;
// anything else is the same 404.
export default defineEventHandler(async (event) => {
  const tenantId = getRouterParam(event, 'tenantId')!
  const { user, tenant } = await requireTenantRole(event, tenantId, 'viewer')

  const [fields, match] = await Promise.all([visibleMessageFields(tenantId), memberMessageMatch(tenantId, user)])
  const accounts = await useDb().query.tenantRecordingAccounts.findMany({
    where: eq(tables.tenantRecordingAccounts.tenantId, tenantId)
  })
  const message = fields.length
    ? await messageSource().get(getRouterParam(event, 'messageId')!, {
        tenantId,
        accountNumbers: accounts.map(account => account.accountNumber),
        fields,
        match
      })
    : null
  const historyStart = messageHistoryStart(tenant.recordingHistoryDays)
  if (!message || !message.createdAt || message.createdAt < historyStart || !messageMatches(message.values, match)) {
    throw createError({ statusCode: 404, message: 'Message not found' })
  }
  return serializeMessage(message, fields)
})
