import { describe, expect, it } from 'vitest'
import { parseCsv } from '../../scripts/import-v1/csv'
import { buildImportPlan, ImportError, mapTimezone, toSlug } from '../../scripts/import-v1/map'
import type { CsvRow } from '../../scripts/import-v1/map'

/**
 * The one-off v1 import (scripts/import-v1.ts): CSV parsing and the mapping
 * from v1 accounts and users to tenants, account numbers, users and
 * memberships. Synthetic fixtures only, never the real export.
 */

function account(overrides: Partial<CsvRow> = {}): CsvRow {
  return { id: '10', name: 'Acme Corp', account_number: '1234', recordings_client_numbers: '1234', ...overrides }
}

function user(overrides: Partial<CsvRow> = {}): CsvRow {
  return {
    id: '100',
    account_id: '10',
    email: 'person@example.com',
    name: 'A Person',
    password: 'v1-hash-must-not-be-used',
    time_zone: 'America/Detroit',
    locked: 'false',
    is_deleted: 'false',
    ...overrides
  }
}

describe('parseCsv', () => {
  it('handles quotes, doubled quotes, commas and line breaks inside fields', () => {
    const rows = parseCsv('﻿id,name,note\r\n1,"Smith, Jo","said ""hi""\nthen left"\n2,Plain,\n')
    expect(rows).toEqual([
      { id: '1', name: 'Smith, Jo', note: 'said "hi"\nthen left' },
      { id: '2', name: 'Plain', note: '' }
    ])
  })

  it('rejects rows with the wrong number of fields and unterminated quotes', () => {
    expect(() => parseCsv('a,b\n1,2,3\n')).toThrow('Row 2 has 3 fields')
    expect(() => parseCsv('a,b\n1,"open\n')).toThrow('Unterminated')
  })
})

describe('toSlug and mapTimezone', () => {
  it('makes the same slug as the admin form', () => {
    expect(toSlug('US Steel - Alabama (FlatRoll)')).toBe('us-steel-alabama-flatroll')
    expect(toSlug('Malnove, Inc.')).toBe('malnove-inc')
  })

  it('maps v1 zone names to Insight IDs and rejects others', () => {
    expect(mapTimezone('America/Detroit')).toBe('America/New_York')
    expect(mapTimezone('US/Central')).toBe('America/Chicago')
    expect(mapTimezone('America/Denver')).toBe('America/Denver')
    expect(mapTimezone('')).toBeNull()
    expect(mapTimezone('Europe/London')).toBeUndefined()
    expect(mapTimezone('constructor')).toBeUndefined()
  })
})

describe('buildImportPlan', () => {
  it('maps an account to an active tenant and its users to viewers without passwords', () => {
    const plan = buildImportPlan({
      accounts: [account({ recordings_client_numbers: '0001234' })],
      users: [user({ email: '  Person@Example.COM ' }), user({ id: '101', email: 'other@example.com', time_zone: 'America/Denver' })],
      userFilters: []
    })
    expect(plan.tenants).toEqual([{
      v1Id: '10',
      name: 'Acme Corp',
      slug: 'acme-corp',
      timezone: 'America/New_York',
      historyDays: 365,
      accountNumbers: ['1234']
    }])
    expect(plan.users).toEqual([
      { v1Id: '100', v1AccountId: '10', email: 'person@example.com', name: 'A Person', timezone: null, disabled: false },
      { v1Id: '101', v1AccountId: '10', email: 'other@example.com', name: 'A Person', timezone: 'America/Denver', disabled: false }
    ])
    expect(JSON.stringify(plan)).not.toContain('v1-hash')
  })

  it('skips an account whose client numbers are a range, with its users', () => {
    const plan = buildImportPlan({
      accounts: [account(), account({ id: '4', name: 'Answer United', recordings_client_numbers: '1-9999999999' })],
      users: [user(), user({ id: '200', account_id: '4', email: 'staff@example.com' })],
      userFilters: []
    })
    expect(plan.tenants.map(t => t.v1Id)).toEqual(['10'])
    expect(plan.users.map(u => u.v1Id)).toEqual(['100'])
    expect(plan.skippedAccounts).toEqual([{ v1Id: '4', reason: 'recordings client numbers are a range', users: 1 }])
  })

  it('falls back to the v1 account number when there is no client number', () => {
    const plan = buildImportPlan({ accounts: [account({ recordings_client_numbers: '', account_number: '4406' })], users: [], userFilters: [] })
    expect(plan.tenants[0]!.accountNumbers).toEqual(['4406'])
    expect(plan.warnings).toEqual(['account 10: no recordings client number, using its v1 account number'])
  })

  it('disables users who had message filters, and locked users; skips deleted ones', () => {
    const plan = buildImportPlan({
      accounts: [account()],
      users: [
        user(),
        user({ id: '101', email: 'filtered@example.com' }),
        user({ id: '102', email: 'locked@example.com', locked: 'true' }),
        user({ id: '103', email: 'deleted@example.com', is_deleted: 'true' })
      ],
      userFilters: [{ user_id: '101', filter_id: '12' }, { user_id: '999', filter_id: '12' }]
    })
    expect(plan.users.map(u => [u.v1Id, u.disabled])).toEqual([['100', false], ['101', true], ['102', true]])
    expect(plan.skippedUsers).toEqual([{ v1Id: '103', reason: 'deleted in v1' }])
  })

  it('reports every problem by v1 id, without emails or names', () => {
    const run = () => buildImportPlan({
      accounts: [account(), account({ id: '11', name: 'ACME corp', recordings_client_numbers: '1234' })],
      users: [
        user(),
        user({ id: '101', email: 'PERSON@example.com' }),
        user({ id: '102', email: 'not-an-email' }),
        user({ id: '103', email: 'tz@example.com', time_zone: 'Europe/London' }),
        user({ id: '104', email: 'orphan@example.com', account_id: '77' })
      ],
      userFilters: []
    })
    expect(run).toThrow(ImportError)
    try {
      run()
    } catch (err) {
      expect((err as ImportError).problems).toEqual([
        'account 11: account number also belongs to account 10',
        'account 11: name makes the same URL slug as account 10',
        'user 101: same email address as user 100',
        'user 102: email address is not valid',
        'user 103: timezone is not one Insight offers',
        'user 104: account 77 is not in accounts.csv'
      ])
      expect((err as ImportError).message).not.toContain('@')
    }
  })
})
