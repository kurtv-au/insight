import type { MessageQuery, MessageSource, StoredMessage } from '../utils/messages'

// Sample messages for development only (messageSource() never returns this in
// production). Generated from the tenant's configured fields with the same
// generator the admin preview uses, so the layout can be checked end to end.

const COUNT = 57

function generate(query: Pick<MessageQuery, 'accountNumbers' | 'fields'>): StoredMessage[] {
  // Anchored to the hour, so pages and deep links agree between requests
  const now = new Date()
  now.setUTCMinutes(0, 0, 0)
  return sampleMessageRows(query.fields, { count: COUNT, now, accountNumber: query.accountNumbers[0] ?? null })
    .map(row => ({
      id: row.id.replace('sample', 'mock'),
      createdAt: row.createdAt ? new Date(row.createdAt) : null,
      accountNumber: row.accountNumber,
      values: row.fields
    }))
}

function matches(message: StoredMessage, query: MessageQuery) {
  if (query.from && (!message.createdAt || message.createdAt < query.from)) {
    return false
  }
  if (query.to && (!message.createdAt || message.createdAt >= query.to)) {
    return false
  }
  if (!query.q) {
    return true
  }
  // Search only what the tenant can see
  const needle = query.q.toLowerCase()
  return query.fields.some((field) => {
    const value = message.values[field.fieldKey]
    return value !== null && value !== undefined && String(value).toLowerCase().includes(needle)
  })
}

export const mockMessages: MessageSource = {
  isMock: true,

  async list(query) {
    const all = generate(query).filter(message => matches(message, query))
    return { items: all.slice(query.offset, query.offset + query.limit), total: all.length }
  },

  async get(id, query) {
    return generate(query).find(message => message.id === id) ?? null
  }
}
