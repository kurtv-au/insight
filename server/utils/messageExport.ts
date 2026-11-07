import { formatFieldValue } from '../../shared/utils/messageFields'
import type { MessageColumnField, MessageRow } from '../../shared/utils/messageFields'
import type { MessageQuery, MessageSource, StoredMessage } from './messages'
import { timezoneLabel } from '../../shared/utils/timezones'

/** Messages one CSV export, or one sorted list, may hold; more means choose a shorter range or search */
export const MAX_EXPORT_MESSAGES = 10_000
/** au-api's largest page of /v1/messages */
export const EXPORT_PAGE_SIZE = 500

/**
 * Every message matching the query, newest first, fetched in au-api's largest
 * pages (au-api caches each week for a minute, so this is cheap after the
 * first page). Refuses more than MAX_EXPORT_MESSAGES, checked from the first
 * page's total before fetching the rest; `tooMany` words the refusal.
 */
export async function loadAllMessages(
  source: Pick<MessageSource, 'list'>,
  query: Omit<MessageQuery, 'offset' | 'limit'>,
  tooMany: (total: number, max: number) => string
): Promise<StoredMessage[]> {
  const messages: StoredMessage[] = []
  let total = Infinity
  for (let offset = 0; offset < total; offset += EXPORT_PAGE_SIZE) {
    const page = await source.list({ ...query, offset, limit: EXPORT_PAGE_SIZE })
    total = page.total
    if (total > MAX_EXPORT_MESSAGES) {
      throw createError({ statusCode: 400, message: tooMany(total, MAX_EXPORT_MESSAGES) })
    }
    messages.push(...page.items)
    if (!page.items.length) {
      break
    }
  }
  return messages
}

/** The fields an export has: every field the messages page shows, list or detail, in order */
export function exportFields<T extends Pick<MessageColumnField, 'order' | 'showInList' | 'showInDetail'>>(fields: readonly T[]) {
  return fields.filter(field => field.showInList || field.showInDetail).sort((a, b) => a.order - b.order)
}

/** "2026-10-28 13:30" in the zone: sorts as text and spreadsheets read it as a date */
export function exportDateTime(date: Date, timeZone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date).map(part => [part.type, part.value]))
  return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}`
}

/** The calendar day of a moment in the zone, e.g. for a file name */
export function exportDate(date: Date, timeZone: string) {
  return exportDateTime(date, timeZone).slice(0, 10)
}

/**
 * The export's rows, header first: when the message was taken (in the
 * viewer's zone, unless the account doesn't show it), its account number, then
 * each field as the messages page formats it in full. Empty values are left
 * empty.
 */
export function messagesToCsvRows(
  messages: readonly MessageRow[],
  fields: readonly MessageColumnField[],
  timeZone: string,
  options: { received?: boolean } = {}
): string[][] {
  const received = options.received !== false
  const columns = exportFields(fields)
  const header = [...(received ? [`Received (${timezoneLabel(timeZone)})`] : []), 'Account #', ...columns.map(field => field.label)]
  const rows = messages.map(message => [
    ...(received ? [message.createdAt ? exportDateTime(new Date(message.createdAt), timeZone) : ''] : []),
    message.accountNumber ?? '',
    ...columns.map((field) => {
      const value = message.fields[field.fieldKey]
      return value === null || value === undefined || value === ''
        ? ''
        : formatFieldValue(value, field.type, field.format, { timeZone, context: 'detail' })
    })
  ])
  return [header, ...rows]
}
