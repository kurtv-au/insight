import { describe, expect, it } from 'vitest'
import { buildFilterPlan } from '../../scripts/import-v1/filters'
import type { CsvRow } from '../../scripts/import-v1/map'

/**
 * The v1 message-filter import (scripts/import-v1-filters.ts): attributing
 * filters to accounts, which v1's export doesn't record, and merging repeats.
 * Synthetic fixtures only, never the real export.
 */

function user(id: string, accountId: string, overrides: Partial<CsvRow> = {}): CsvRow {
  return { id, account_id: accountId, email: `User${id}@Example.com `, locked: 'false', is_deleted: 'false', ...overrides }
}

function filter(id: string, field: string, value: string, name = value): CsvRow {
  return { id, name, field, filter_data: value }
}

const field = (accountId: string, name: string): CsvRow => ({ account_id: accountId, name })

function plan(input: Partial<Parameters<typeof buildFilterPlan>[0]>) {
  return buildFilterPlan({ importedAccountIds: ['10', '20'], users: [], filters: [], userFilters: [], dynamicFields: [], ...input })
}

describe('buildFilterPlan', () => {
  it('places a filter in its active users’ account, with those users', () => {
    const result = plan({
      users: [user('1', '10'), user('2', '10', { locked: 'true' }), user('3', '10', { is_deleted: 'true' })],
      filters: [filter('5', 'GALLEY', 'GL7112')],
      userFilters: [{ user_id: '1', filter_id: '5' }, { user_id: '2', filter_id: '5' }, { user_id: '3', filter_id: '5' }]
    })
    expect(result.skipped).toEqual([])
    expect(result.filters).toEqual([{
      v1Ids: ['5'],
      v1AccountId: '10',
      name: 'GL7112',
      field: 'GALLEY',
      value: 'GL7112',
      users: [{ v1Id: '1', email: 'user1@example.com', locked: false }, { v1Id: '2', email: 'user2@example.com', locked: true }]
    }])
  })

  it('places an unassigned filter by its field only when one imported account has it', () => {
    const result = plan({
      filters: [filter('5', 'GALLEY', 'GL7102'), filter('6', 'DEPARTMENT', 'Cheese'), filter('7', 'NOPE', 'x')],
      dynamicFields: [field('10', 'Galley'), field('10', 'DEPARTMENT'), field('20', 'DEPARTMENT'), field('99', 'NOPE')]
    })
    expect(result.filters.map(f => [f.v1Ids, f.v1AccountId, f.users])).toEqual([[['5'], '10', []]])
    expect(result.skipped).toEqual([
      { v1Id: '6', reason: 'no active users, and its field is in several accounts' },
      { v1Id: '7', reason: 'no active users, and no account has its field' }
    ])
  })

  it('skips filters shared across accounts or of an account that wasn’t imported', () => {
    const result = plan({
      users: [user('1', '10'), user('2', '20'), user('3', '30')],
      filters: [filter('5', 'GALLEY', 'A'), filter('6', 'GALLEY', 'B')],
      userFilters: [{ user_id: '1', filter_id: '5' }, { user_id: '2', filter_id: '5' }, { user_id: '3', filter_id: '6' }]
    })
    expect(result.filters).toEqual([])
    expect(result.skipped).toEqual([
      { v1Id: '5', reason: 'assigned to users of several accounts' },
      { v1Id: '6', reason: 'account 30 wasn’t imported' }
    ])
  })

  it('skips empty values and fields au-api can’t load', () => {
    const result = plan({
      users: [user('1', '10')],
      filters: [filter('5', 'GALLEY', ' '), filter('6', 'Caller Name', 'x')],
      userFilters: [{ user_id: '1', filter_id: '5' }, { user_id: '1', filter_id: '6' }]
    })
    expect(result.filters).toEqual([])
    expect(result.skipped.map(s => s.v1Id)).toEqual(['5', '6'])
  })

  it('merges the same field and value, keeping the name of the one with users', () => {
    const result = plan({
      users: [user('1', '10')],
      filters: [filter('58', 'GALLEY', 'GLTri'), filter('65', 'galley', 'GLTRI')],
      userFilters: [{ user_id: '1', filter_id: '65' }],
      dynamicFields: [field('10', 'GALLEY')]
    })
    expect(result.filters).toHaveLength(1)
    expect(result.filters[0]).toMatchObject({ v1Ids: ['58', '65'], name: 'GLTRI', field: 'galley', value: 'GLTRI' })
    expect(result.filters[0]!.users.map(u => u.v1Id)).toEqual(['1'])
  })

  it('tells apart two filters with the same name by v1 id', () => {
    const result = plan({
      users: [user('1', '10')],
      filters: [filter('5', 'GALLEY', 'A', 'Galley'), filter('6', 'GALLEY', 'B', 'galley')],
      userFilters: [{ user_id: '1', filter_id: '5' }, { user_id: '1', filter_id: '6' }]
    })
    expect(result.filters.map(f => f.name)).toEqual(['Galley', 'galley (v1 6)'])
  })
})
