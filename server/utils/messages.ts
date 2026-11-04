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
