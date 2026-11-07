import { z } from 'zod'
import { auApiMessages, MESSAGES_UNAVAILABLE } from '../messages/au-api'
import { mockMessages } from '../messages/mock'

/**
 * A stored message, as a message source returns it. `values` is keyed by the
 * script's field names in whatever casing the store uses; serializeMessage()
 * maps them onto the tenant's configured fieldKeys case-insensitively.
 */
export interface StoredMessage {
  id: string
  /** When the message was taken; null if the store has no time for it */
  createdAt: Date | null
  accountNumber: string | null
  values: Record<string, unknown>
}

export interface MessageQuery {
  tenantId: string
  /** The tenant's account numbers (au-api client numbers) */
  accountNumbers: string[]
  /** The fields the tenant shows. Search must only look at these. */
  fields: MessageColumnField[]
  from?: Date
  /** Exclusive */
  to?: Date
  q?: string
  offset: number
  limit: number
}

export interface MessageSource {
  /** True for generated sample data */
  readonly isMock: boolean
  /** Newest first, one page at a time */
  list(query: MessageQuery): Promise<{ items: StoredMessage[], total: number }>
  /** One message, only if it belongs to one of the query's account numbers */
  get(id: string, query: Pick<MessageQuery, 'tenantId' | 'accountNumbers' | 'fields'>): Promise<StoredMessage | null>
}

/**
 * Where messages come from: au-api when a key is configured. Without one,
 * development uses generated rows in the configured layout and production
 * fails rather than show made-up messages.
 */
export function messageSource(): MessageSource {
  if (useRuntimeConfig().auApi.key) {
    return auApiMessages
  }
  if (import.meta.dev) {
    return mockMessages
  }
  throw createError({ statusCode: 503, message: MESSAGES_UNAVAILABLE })
}

/**
 * The earliest moment a tenant's messages can be loaded from. Messages share
 * the recordings history setting. Rounded down to the minute so a range clamped
 * to it stays the same between requests (au-api caches by range).
 */
export function messageHistoryStart(historyDays: number, now = new Date()) {
  const start = recordingHistoryStart(historyDays, now)
  start.setUTCSeconds(0, 0)
  return start
}

const DAY_MS = 24 * 60 * 60 * 1000
const MINUTE_MS = 60 * 1000
/** Seven calendar days across a DST change are an hour longer */
const MAX_SPAN_MS = MAX_MESSAGE_RANGE_DAYS * DAY_MS + 60 * MINUTE_MS

/** The filters the messages list and its export share */
export const messageRangeQuerySchema = z.object({
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  q: z.string().trim().max(100).optional()
})

/**
 * The instants to load messages between, from the page's filters. No `to`
 * means up to now (rounded up to the minute, so repeated requests share
 * au-api's cache); no `from` means the week before `to`. Longer ranges are
 * refused, and nothing before the tenant's history window is loaded. Null when
 * the whole range is before that window.
 */
export function resolveMessageRange(query: { from?: string, to?: string }, historyDays: number, now = Date.now()) {
  const to = query.to ? new Date(query.to) : new Date(Math.ceil(now / MINUTE_MS) * MINUTE_MS)
  const requestedFrom = query.from ? new Date(query.from) : new Date(to.getTime() - MAX_MESSAGE_RANGE_DAYS * DAY_MS)
  if (to.getTime() - requestedFrom.getTime() > MAX_SPAN_MS) {
    throw createError({ statusCode: 400, message: `Choose a range of ${MAX_MESSAGE_RANGE_DAYS} days or less` })
  }
  const historyStart = messageHistoryStart(historyDays, new Date(now))
  const from = requestedFrom < historyStart ? historyStart : requestedFrom
  return to <= from ? null : { from, to }
}

function toFieldValue(value: unknown): MessageFieldValue {
  if (value === null || value === undefined) {
    return null
  }
  if (typeof value === 'string' || typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) {
    return value
  }
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString()
  }
  return String(value)
}

/**
 * Projects a stored message onto the tenant's visible fields. Values for
 * fields that aren't configured, inactive or orphaned never reach the browser.
 */
export function serializeMessage(message: StoredMessage, fields: readonly Pick<MessageColumnField, 'fieldKey'>[]): MessageRow {
  const values = new Map(Object.entries(message.values).map(([key, value]) => [canonicalFieldKey(key), value]))
  return {
    id: message.id,
    createdAt: message.createdAt?.toISOString() ?? null,
    accountNumber: message.accountNumber,
    fields: Object.fromEntries(fields.map(field => [field.fieldKey, toFieldValue(values.get(canonicalFieldKey(field.fieldKey)))]))
  }
}
