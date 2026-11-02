import { mockMessages } from '../messages/mock'
import { stubMessages } from '../messages/stub'

/**
 * A stored message, as a message source returns it. `values` is keyed by the
 * script's field names in whatever casing the store uses; serializeMessage()
 * maps them onto the tenant's configured fieldKeys case-insensitively.
 */
export interface StoredMessage {
  id: string
  createdAt: Date
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
 * Where messages come from. Until real retrieval exists this is the empty stub
 * (server/messages/stub.ts); in development `mock` swaps in generated sample
 * rows so the configured layout can be checked. Production ignores `mock`.
 */
export function messageSource(options: { mock?: boolean } = {}): MessageSource {
  if (options.mock && import.meta.dev) {
    return mockMessages
  }
  return stubMessages
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
    createdAt: message.createdAt.toISOString(),
    accountNumber: message.accountNumber,
    fields: Object.fromEntries(fields.map(field => [field.fieldKey, toFieldValue(values.get(canonicalFieldKey(field.fieldKey)))]))
  }
}
