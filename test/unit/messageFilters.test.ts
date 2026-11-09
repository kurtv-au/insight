import { describe, expect, it } from 'vitest'
import {
  buildMessageMatch,
  MAX_MATCH_FIELDS,
  MAX_MATCH_VALUES,
  memberMessageFiltersSchema,
  messageFilterSchema,
  messageMatches,
  messageMatchFields,
  messageMatchProblem
} from '../../shared/utils/messageFilters'

/**
 * The shared message-filter rules: how a member's filters become au-api's
 * `match`, and the same matching the mock and the single-message route use.
 */

describe('buildMessageMatch', () => {
  it('is null without filters, so nothing is filtered', () => {
    expect(buildMessageMatch([])).toBeNull()
  })

  it('groups by field ignoring case, keeping the first spelling and each value once', () => {
    expect(buildMessageMatch([
      { fieldKey: 'GALLEY', value: 'GL7112' },
      { fieldKey: 'galley', value: ' gl7112 ' },
      { fieldKey: 'Galley', value: 'GL535' },
      { fieldKey: 'Department', value: 'Cheese' }
    ])).toEqual({ GALLEY: ['GL7112', 'GL535'], Department: ['Cheese'] })
  })
})

describe('messageMatches', () => {
  const match = { GALLEY: ['GL7112', 'GL535'], DEPARTMENT: ['Cheese'] }

  it('passes everything without a match', () => {
    expect(messageMatches({ GALLEY: 'anything' }, null)).toBe(true)
  })

  it('matches any filter, exactly after trimming, ignoring case', () => {
    expect(messageMatches({ Galley: ' gl7112 ' }, match)).toBe(true)
    expect(messageMatches({ GALLEY: 'GL535' }, match)).toBe(true)
    expect(messageMatches({ GALLEY: 'other', department: 'CHEESE' }, match)).toBe(true)
  })

  it('doesn’t match a longer or partial value', () => {
    expect(messageMatches({ GALLEY: 'GL71120' }, match)).toBe(false)
    expect(messageMatches({ GALLEY: 'GL711' }, match)).toBe(false)
  })

  it('fails closed when the field is missing or empty', () => {
    expect(messageMatches({}, match)).toBe(false)
    expect(messageMatches({ GALLEY: null, DEPARTMENT: undefined }, match)).toBe(false)
  })
})

describe('limits and schemas', () => {
  it('lists the match fields', () => {
    expect(messageMatchFields(null)).toEqual([])
    expect(messageMatchFields({ GALLEY: ['x'], DEPT: ['y'] })).toEqual(['GALLEY', 'DEPT'])
  })

  it('refuses more fields or values than au-api takes', () => {
    expect(messageMatchProblem(null)).toBeNull()
    const fields = Object.fromEntries(Array.from({ length: MAX_MATCH_FIELDS + 1 }, (_, i) => [`F${i}`, ['x']]))
    expect(messageMatchProblem(fields)).toMatch(/at most 10 different fields/)
    expect(messageMatchProblem({ F: Array.from({ length: MAX_MATCH_VALUES + 1 }, (_, i) => `v${i}`) })).toMatch(/at most 100 filters/)
    expect(messageMatchProblem({ F: Array.from({ length: MAX_MATCH_VALUES }, (_, i) => `v${i}`) })).toBeNull()
  })

  it('trims a filter and refuses a field au-api can’t load', () => {
    expect(messageFilterSchema.parse({ name: ' GL7112 ', fieldKey: 'GALLEY', value: ' GL7112 ' }))
      .toEqual({ name: 'GL7112', fieldKey: 'GALLEY', value: 'GL7112' })
    expect(messageFilterSchema.safeParse({ name: 'x', fieldKey: 'Caller Name', value: 'y' }).success).toBe(false)
    expect(messageFilterSchema.safeParse({ name: 'x', fieldKey: 'GALLEY', value: '   ' }).success).toBe(false)
  })

  it('refuses a filter listed twice for a member', () => {
    expect(memberMessageFiltersSchema.safeParse({ filterIds: ['a', 'a'] }).success).toBe(false)
    expect(memberMessageFiltersSchema.safeParse({ filterIds: [] }).success).toBe(true)
  })
})
