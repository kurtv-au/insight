/**
 * Turns v1's message filters (message_filters.csv, users_messagefilters.csv)
 * into the filters to create per imported account, with the v1 users each is
 * assigned to. Pure: no database, no file system. Output names v1 ids only.
 *
 * v1's filter table has no account column, so each filter is attributed:
 * - to the one account its active (not deleted) users belong to;
 * - with no active users, to the one imported account whose v1 message fields
 *   (dynamic_fields.csv) include the filter's field;
 * - otherwise it's skipped. A filter shared by several accounts' users, or on a
 *   field many accounts have, can't be placed safely.
 *
 * Filters with the same field and value in one account (v1 had "GLTri" and
 * "GLTRI") are merged: Insight matches ignoring case, so they're the same rule.
 * The one with active users, then the lowest id, keeps its name.
 */
import { canonicalFieldKey, isRetrievableFieldKey } from '../../shared/utils/messageFields.ts'
import type { CsvRow } from './map.ts'

export interface V1FilterUser {
  v1Id: string
  email: string
  locked: boolean
}

export interface PlannedFilter {
  /** The v1 filters merged into this one, lowest first */
  v1Ids: string[]
  v1AccountId: string
  name: string
  field: string
  value: string
  /** Active v1 users it's assigned to */
  users: V1FilterUser[]
}

export interface FilterPlan {
  filters: PlannedFilter[]
  skipped: { v1Id: string, reason: string }[]
}

const isTrue = (value: string | undefined) => value?.trim().toLowerCase() === 'true'

export function buildFilterPlan(input: {
  /** v1 ids of the accounts the account import turned into tenants */
  importedAccountIds: readonly string[]
  users: CsvRow[]
  filters: CsvRow[]
  userFilters: CsvRow[]
  dynamicFields: CsvRow[]
}): FilterPlan {
  const imported = new Set(input.importedAccountIds)
  const skipped: FilterPlan['skipped'] = []

  const activeUsers = new Map<string, CsvRow>()
  for (const user of input.users) {
    if (!isTrue(user.is_deleted)) {
      activeUsers.set((user.id ?? '').trim(), user)
    }
  }

  const usersOfFilter = new Map<string, CsvRow[]>()
  for (const link of input.userFilters) {
    const user = activeUsers.get((link.user_id ?? '').trim())
    if (user) {
      const filterId = (link.filter_id ?? '').trim()
      usersOfFilter.set(filterId, [...usersOfFilter.get(filterId) ?? [], user])
    }
  }

  // Imported accounts by the fields their v1 messages had
  const accountsWithField = new Map<string, Set<string>>()
  for (const row of input.dynamicFields) {
    const accountId = (row.account_id ?? '').trim()
    if (!imported.has(accountId)) {
      continue
    }
    const key = canonicalFieldKey(row.name ?? '')
    if (!accountsWithField.has(key)) {
      accountsWithField.set(key, new Set())
    }
    accountsWithField.get(key)!.add(accountId)
  }

  interface Candidate { v1Id: string, v1AccountId: string, name: string, field: string, value: string, users: CsvRow[] }
  const candidates: Candidate[] = []
  for (const filter of input.filters) {
    const v1Id = (filter.id ?? '').trim()
    const name = (filter.name ?? '').trim()
    const field = (filter.field ?? '').trim()
    const value = (filter.filter_data ?? '').trim()
    if (!name || !value || name.length > 255 || value.length > 255) {
      skipped.push({ v1Id, reason: 'empty, or longer than 255 characters' })
      continue
    }
    if (!isRetrievableFieldKey(field)) {
      skipped.push({ v1Id, reason: 'its field can’t be loaded from au-api' })
      continue
    }

    const users = usersOfFilter.get(v1Id) ?? []
    const userAccounts = new Set(users.map(user => (user.account_id ?? '').trim()))
    let v1AccountId: string
    if (userAccounts.size > 1) {
      skipped.push({ v1Id, reason: 'assigned to users of several accounts' })
      continue
    } else if (userAccounts.size === 1) {
      v1AccountId = [...userAccounts][0]!
      if (!imported.has(v1AccountId)) {
        skipped.push({ v1Id, reason: `account ${v1AccountId} wasn’t imported` })
        continue
      }
    } else {
      const owners = [...accountsWithField.get(canonicalFieldKey(field)) ?? []]
      if (owners.length !== 1) {
        skipped.push({ v1Id, reason: owners.length ? 'no active users, and its field is in several accounts' : 'no active users, and no account has its field' })
        continue
      }
      v1AccountId = owners[0]!
    }
    candidates.push({ v1Id, v1AccountId, name, field, value, users })
  }

  // Merge the same rule within an account; keep the name with users, then the lowest id
  const byNumber = (a: string, b: string) => Number(a) - Number(b) || a.localeCompare(b)
  candidates.sort((a, b) => Number(!a.users.length) - Number(!b.users.length) || byNumber(a.v1Id, b.v1Id))
  const merged = new Map<string, PlannedFilter>()
  for (const candidate of candidates) {
    const key = `${candidate.v1AccountId}\u0000${canonicalFieldKey(candidate.field)}\u0000${candidate.value.toLowerCase()}`
    const users = candidate.users.map(user => ({
      v1Id: (user.id ?? '').trim(),
      email: (user.email ?? '').trim().toLowerCase(),
      locked: isTrue(user.locked)
    }))
    const existing = merged.get(key)
    if (existing) {
      existing.v1Ids.push(candidate.v1Id)
      for (const user of users) {
        if (!existing.users.some(u => u.v1Id === user.v1Id)) {
          existing.users.push(user)
        }
      }
      continue
    }
    merged.set(key, {
      v1Ids: [candidate.v1Id],
      v1AccountId: candidate.v1AccountId,
      name: candidate.name,
      field: candidate.field,
      value: candidate.value,
      users
    })
  }

  // Names are unique per account (ignoring case); a clash keeps both, told apart by v1 id
  const filters = [...merged.values()].sort((a, b) => byNumber(a.v1Ids[0]!, b.v1Ids[0]!))
  const names = new Set<string>()
  for (const filter of filters) {
    filter.v1Ids.sort(byNumber)
    const key = `${filter.v1AccountId}\u0000${filter.name.toLowerCase()}`
    if (names.has(key)) {
      filter.name = `${filter.name} (v1 ${filter.v1Ids[0]})`.slice(0, 255)
    }
    names.add(`${filter.v1AccountId}\u0000${filter.name.toLowerCase()}`)
  }
  return { filters, skipped }
}
