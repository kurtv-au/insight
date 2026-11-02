import type { MessageSource } from '../utils/messages'

// ============================================================================
// STUB (data-retrieval session): replace with the real message source.
//
// Return StoredMessage rows for the query's account numbers, newest first,
// with `values` keyed by the script's field names (the same names au-api's
// /v1/scripts/active publishes as `key`). serializeMessage() does the rest.
// See docs/messages-handoff.md.
// ============================================================================
export const stubMessages: MessageSource = {
  isMock: false,

  async list() {
    return { items: [], total: 0 }
  },

  async get() {
    return null
  }
}
