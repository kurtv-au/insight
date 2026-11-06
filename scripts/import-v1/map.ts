/**
 * Turns the v1 Insight export (accounts.csv, users.csv, users_messagefilters.csv)
 * into the tenants, account numbers, users and memberships to create. Pure: no
 * database, no file system. Errors and warnings name v1 ids only, never emails
 * or names, so the output is safe to log.
 *
 * Mapping decisions (see docs/DEPLOYMENT.md, "One-off v1 import"):
 * - An account whose recordings client numbers are a range (Answer United's
 *   1-9999999999) is skipped with its users; staff are made platform admins one
 *   by one instead.
 * - An account without recordings client numbers falls back to its v1 account
 *   number, with a warning.
 * - Every tenant is active with the default 365 days of history; every member
 *   is a viewer, and owners are assigned afterwards.
 * - Users with v1 message filters are imported disabled: Insight has no
 *   per-user filters, so enabling them would widen what they can see.
 * - Passwords are never read. Users sign in with an emailed link.
 */
import { DEFAULT_RECORDING_HISTORY_DAYS } from '../../shared/utils/recordings.ts'
import { accountNumberSchema, emailSchema, nameSchema, slugSchema } from '../../shared/utils/schemas.ts'
import { DEFAULT_TIMEZONE, TIMEZONE_IDS } from '../../shared/utils/timezones.ts'
import type { Timezone } from '../../shared/utils/timezones.ts'

export type CsvRow = Record<string, string>

export interface ImportInput {
  accounts: CsvRow[]
  users: CsvRow[]
  userFilters: CsvRow[]
}

export interface PlannedTenant {
  v1Id: string
  name: string
  slug: string
  timezone: Timezone
  historyDays: number
  accountNumbers: string[]
}

export interface PlannedUser {
  v1Id: string
  v1AccountId: string
  email: string
  name: string
  /** Null follows the tenant's timezone */
  timezone: Timezone | null
  disabled: boolean
}

export interface ImportPlan {
  tenants: PlannedTenant[]
  users: PlannedUser[]
  skippedAccounts: { v1Id: string, reason: string, users: number }[]
  skippedUsers: { v1Id: string, reason: string }[]
  warnings: string[]
}

export class ImportError extends Error {
  problems: string[]

  constructor(problems: string[]) {
    super(`The v1 export has ${problems.length} problem(s):\n${problems.map(p => `  - ${p}`).join('\n')}`)
    this.problems = problems
  }
}

/** v1 timezone names that aren't Insight's canonical IDs */
const TIMEZONE_ALIASES: Record<string, Timezone> = {
  'America/Detroit': 'America/New_York',
  'US/Eastern': 'America/New_York',
  'US/Central': 'America/Chicago',
  'US/Mountain': 'America/Denver',
  'US/Arizona': 'America/Phoenix',
  'US/Pacific': 'America/Los_Angeles'
}

/** Same rule as the slug suggested in the admin "New account" form */
export function toSlug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 64).replace(/-+$/, '')
}

export function mapTimezone(value: string): Timezone | null | undefined {
  const raw = value.trim()
  if (!raw) {
    return null
  }
  if (Object.hasOwn(TIMEZONE_ALIASES, raw)) {
    return TIMEZONE_ALIASES[raw]
  }
  return (TIMEZONE_IDS as readonly string[]).includes(raw) ? raw as Timezone : undefined
}

const isTrue = (value: string | undefined) => value?.trim().toLowerCase() === 'true'

function column(row: CsvRow, name: string, file: string): string {
  const value = row[name]
  if (value === undefined) {
    throw new ImportError([`${file} has no "${name}" column`])
  }
  return value
}

function mostCommon<T>(values: T[]): T | undefined {
  const counts = new Map<T, number>()
  let best: T | undefined
  let bestCount = 0
  for (const value of values) {
    const count = (counts.get(value) ?? 0) + 1
    counts.set(value, count)
    if (count > bestCount) {
      best = value
      bestCount = count
    }
  }
  return best
}

export function buildImportPlan({ accounts, users, userFilters }: ImportInput): ImportPlan {
  const problems: string[] = []
  const warnings: string[] = []
  const skippedAccounts: ImportPlan['skippedAccounts'] = []
  const skippedUsers: ImportPlan['skippedUsers'] = []

  const usersByAccount = new Map<string, CsvRow[]>()
  for (const user of users) {
    const accountId = column(user, 'account_id', 'users.csv').trim()
    usersByAccount.set(accountId, [...usersByAccount.get(accountId) ?? [], user])
  }

  const filteredUserIds = new Set(userFilters.map(link => column(link, 'user_id', 'users_messagefilters.csv').trim()))

  // Tenants
  const tenants: PlannedTenant[] = []
  const slugs = new Map<string, string>()
  const numbers = new Map<string, string>()
  for (const account of accounts) {
    const v1Id = column(account, 'id', 'accounts.csv').trim()
    const accountUsers = usersByAccount.get(v1Id) ?? []
    const clientNumbers = column(account, 'recordings_client_numbers', 'accounts.csv').split(/[\s,;]+/).filter(Boolean)

    if (clientNumbers.some(n => /^\d+-\d+$/.test(n))) {
      skippedAccounts.push({ v1Id, reason: 'recordings client numbers are a range', users: accountUsers.length })
      continue
    }

    let rawNumbers = clientNumbers
    if (!rawNumbers.length) {
      rawNumbers = [column(account, 'account_number', 'accounts.csv').trim()].filter(Boolean)
      warnings.push(`account ${v1Id}: no recordings client number, using its v1 account number`)
    }
    const accountNumbers: string[] = []
    for (const raw of rawNumbers) {
      const parsed = accountNumberSchema.safeParse(raw)
      if (!parsed.success) {
        problems.push(`account ${v1Id}: account number is not up to 10 digits`)
        continue
      }
      const owner = numbers.get(parsed.data)
      if (owner && owner !== v1Id) {
        problems.push(`account ${v1Id}: account number also belongs to account ${owner}`)
      }
      numbers.set(parsed.data, v1Id)
      if (!accountNumbers.includes(parsed.data)) {
        accountNumbers.push(parsed.data)
      }
    }
    if (!rawNumbers.length) {
      problems.push(`account ${v1Id}: no recordings client number or account number`)
    }

    const name = nameSchema.safeParse(column(account, 'name', 'accounts.csv'))
    if (!name.success) {
      problems.push(`account ${v1Id}: name is empty or longer than 255 characters`)
      continue
    }
    const slug = toSlug(name.data)
    if (!slugSchema.safeParse(slug).success) {
      problems.push(`account ${v1Id}: name doesn't make a valid URL slug`)
    } else if (slugs.has(slug)) {
      problems.push(`account ${v1Id}: name makes the same URL slug as account ${slugs.get(slug)}`)
    }
    slugs.set(slug, v1Id)

    const userZones = accountUsers.map(u => mapTimezone(u.time_zone ?? '')).filter((tz): tz is Timezone => !!tz)
    tenants.push({
      v1Id,
      name: name.data,
      slug,
      timezone: mostCommon(userZones) ?? DEFAULT_TIMEZONE,
      historyDays: DEFAULT_RECORDING_HISTORY_DAYS,
      accountNumbers
    })
  }

  // Users
  const tenantsByV1Id = new Map(tenants.map(t => [t.v1Id, t]))
  const skippedAccountIds = new Set(skippedAccounts.map(a => a.v1Id))
  const emails = new Map<string, string>()
  const plannedUsers: PlannedUser[] = []
  for (const user of users) {
    const v1Id = column(user, 'id', 'users.csv').trim()
    const v1AccountId = user.account_id!.trim()

    if (skippedAccountIds.has(v1AccountId)) {
      skippedUsers.push({ v1Id, reason: `account ${v1AccountId} is skipped` })
      continue
    }
    if (isTrue(user.is_deleted)) {
      skippedUsers.push({ v1Id, reason: 'deleted in v1' })
      continue
    }
    const tenant = tenantsByV1Id.get(v1AccountId)
    if (!tenant) {
      // Either an account that failed validation (already reported) or one missing from the export
      if (!accounts.some(a => a.id?.trim() === v1AccountId)) {
        problems.push(`user ${v1Id}: account ${v1AccountId} is not in accounts.csv`)
      }
      continue
    }

    const email = column(user, 'email', 'users.csv').trim().toLowerCase()
    if (!emailSchema.safeParse(email).success) {
      problems.push(`user ${v1Id}: email address is not valid`)
      continue
    }
    if (emails.has(email)) {
      problems.push(`user ${v1Id}: same email address as user ${emails.get(email)}`)
      continue
    }
    emails.set(email, v1Id)

    const name = (user.name ?? '').trim()
    if (name.length > 255) {
      problems.push(`user ${v1Id}: name is longer than 255 characters`)
    }

    const timezone = mapTimezone(user.time_zone ?? '')
    if (timezone === undefined) {
      problems.push(`user ${v1Id}: timezone is not one Insight offers`)
      continue
    }

    plannedUsers.push({
      v1Id,
      v1AccountId,
      email,
      name,
      timezone: timezone === tenant.timezone ? null : timezone,
      disabled: filteredUserIds.has(v1Id) || isTrue(user.locked)
    })
  }

  if (problems.length) {
    throw new ImportError(problems)
  }
  return { tenants, users: plannedUsers, skippedAccounts, skippedUsers, warnings }
}
