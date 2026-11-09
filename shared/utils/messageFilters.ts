/**
 * Message filters: named `field = value` rules an account's owners and admins
 * assign to members. A member with no filters sees every message; a member
 * with filters sees only messages where at least one of them matches.
 *
 * A filter matches when the message's value for the field, trimmed, equals the
 * filter's value, trimmed, ignoring case. A message without the field never
 * matches, so a filter on a field the script no longer has hides everything
 * rather than nothing.
 *
 * au-api applies the same rule (`match` on `/v1/messages`), so totals and paging
 * count only matching messages. The filter field doesn't have to be one the
 * page shows: its value is used for matching only, never returned or searched.
 *
 * Shared by client and server. Imports are explicit (not auto-imports) so unit
 * tests and scripts can load this file on its own.
 */
import { z } from 'zod'
import { canonicalFieldKey, fieldKeySchema, isRetrievableFieldKey } from './messageFields.ts'

/** au-api's `match` takes at most this many fields and values */
export const MAX_MATCH_FIELDS = 10
export const MAX_MATCH_VALUES = 100
/** More than any account needs; keeps the settings table a sane size */
export const MAX_MESSAGE_FILTERS = 500

export const messageFilterSchema = z.object({
  name: z.string().trim().min(1, 'Give the filter a name').max(255, 'At most 255 characters'),
  fieldKey: fieldKeySchema.refine(isRetrievableFieldKey, 'This field can’t be used to filter messages'),
  value: z.string().trim().min(1, 'Enter the value to match').max(255, 'At most 255 characters')
})
export type MessageFilterInput = z.infer<typeof messageFilterSchema>

export const memberMessageFiltersSchema = z.object({
  filterIds: z.array(z.string().min(1).max(36)).max(MAX_MATCH_VALUES)
    .refine(ids => new Set(ids).size === ids.length, 'A filter is listed twice')
})

/** A filter as the settings page and the members page see it */
export interface MessageFilterDto {
  id: string
  name: string
  fieldKey: string
  value: string
  /** Members it's assigned to */
  members: number
  /** Its field isn't in the account's script any more, so it matches nothing */
  orphaned: boolean
}

/**
 * Field (in the script's spelling) → values. Any pair matching keeps a message.
 * Null means no filters apply.
 */
export type MessageMatch = Record<string, string[]>

function normalizeValue(value: string) {
  return value.trim().toLowerCase()
}

/**
 * Groups filters into a match: one entry per field (case-insensitively, first
 * spelling wins), each value once. Null when there are no filters.
 */
export function buildMessageMatch(filters: readonly { fieldKey: string, value: string }[]): MessageMatch | null {
  if (!filters.length) {
    return null
  }
  const spelling = new Map<string, string>()
  const values = new Map<string, Map<string, string>>()
  for (const filter of filters) {
    const key = canonicalFieldKey(filter.fieldKey)
    if (!spelling.has(key)) {
      spelling.set(key, filter.fieldKey.trim())
      values.set(key, new Map())
    }
    const byNormal = values.get(key)!
    const value = filter.value.trim()
    if (!byNormal.has(normalizeValue(value))) {
      byNormal.set(normalizeValue(value), value)
    }
  }
  return Object.fromEntries([...spelling].map(([key, name]) => [name, [...values.get(key)!.values()]]))
}

/** Problems with a set of filters as one member's match, or null if au-api will take it */
export function messageMatchProblem(match: MessageMatch | null) {
  if (!match) {
    return null
  }
  const fields = Object.keys(match)
  if (fields.length > MAX_MATCH_FIELDS) {
    return `A person’s filters can use at most ${MAX_MATCH_FIELDS} different fields`
  }
  if (fields.reduce((sum, field) => sum + match[field]!.length, 0) > MAX_MATCH_VALUES) {
    return `A person can have at most ${MAX_MATCH_VALUES} filters`
  }
  return null
}

/** The field names a match reads */
export function messageMatchFields(match: MessageMatch | null): string[] {
  return match ? Object.keys(match) : []
}

/**
 * Whether a message's values pass a match. `values` may be keyed in any
 * casing. No match (null) passes everything.
 */
export function messageMatches(values: Record<string, unknown>, match: MessageMatch | null) {
  if (!match) {
    return true
  }
  const byKey = new Map(Object.entries(values).map(([key, value]) => [canonicalFieldKey(key), value]))
  return Object.entries(match).some(([field, wanted]) => {
    const value = byKey.get(canonicalFieldKey(field))
    if (value === null || value === undefined) {
      return false
    }
    const actual = normalizeValue(String(value))
    return wanted.some(candidate => normalizeValue(candidate) === actual)
  })
}
