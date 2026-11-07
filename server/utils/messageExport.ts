import { formatFieldValue } from '../../shared/utils/messageFields'
import type { MessageColumnField, MessageRow } from '../../shared/utils/messageFields'
import { timezoneLabel } from '../../shared/utils/timezones'

/** Messages one CSV export may hold; more means choose a shorter range or search */
export const MAX_EXPORT_MESSAGES = 10_000
/** au-api's largest page of /v1/messages */
export const EXPORT_PAGE_SIZE = 500

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
 * viewer's zone), its account number, then each field as the messages page
 * formats it in full. Empty values are left empty.
 */
export function messagesToCsvRows(messages: readonly MessageRow[], fields: readonly MessageColumnField[], timeZone: string): string[][] {
  const columns = exportFields(fields)
  const header = [`Received (${timezoneLabel(timeZone)})`, 'Account #', ...columns.map(field => field.label)]
  const rows = messages.map(message => [
    message.createdAt ? exportDateTime(new Date(message.createdAt), timeZone) : '',
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
