// One-off: message filters for the tenants imported by `pnpm import:v1`, from
// v1's message_filters.csv and users_messagefilters.csv, and the users the
// account import disabled because they had filters.
// Usage: pnpm import:v1-filters <export-dir> [--apply]
//
// Run after `pnpm import:v1` and `pnpm import:v1-fields`: a filter's field must
// be in the tenant's message setup. Dry run by default; --apply writes it all
// in one transaction. Re-running is safe: filters with the same field and value
// are reused, and only missing assignments are added.
//
// A user the account import disabled is re-enabled when they had v1 filters,
// weren't locked in v1, and now have at least one filter in Insight, so they
// see only what v1 showed them. Prints v1 ids, slugs and counts only; never
// emails or the database URL. See docs/DEPLOYMENT.md, "One-off v1 import".
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { and, eq, inArray, isNotNull } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/mysql2'
import { createPool } from 'mysql2/promise'
import * as schema from '../server/db/schema.ts'
import { parseCsv } from './import-v1/csv.ts'

// A NUXT_DATABASE_URL already in the environment wins over .env
if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

const args = process.argv.slice(2)
const apply = args.includes('--apply')
const unknownFlags = args.filter(arg => arg.startsWith('--') && arg !== '--apply')
const [dir] = args.filter(arg => !arg.startsWith('--'))
if (!dir || unknownFlags.length) {
  console.error('Usage: pnpm import:v1-filters <export-dir> [--apply]')
  process.exit(1)
}

const databaseUrl = process.env.NUXT_DATABASE_URL
if (!databaseUrl) {
  console.error('NUXT_DATABASE_URL is not set')
  process.exit(1)
}
// Checked here so a bad URL never reaches an error message: it holds the password
let target: URL
try {
  target = new URL(databaseUrl)
} catch {
  console.error('NUXT_DATABASE_URL is not a valid URL. URL-encode the password (see docs/DEPLOYMENT.md, "One-off v1 import").')
  process.exit(1)
}

// schemas.ts needs the Nuxt auto-imports as globals before it loads
await import('./import-v1/globals.ts')
const { buildImportPlan, ImportError } = await import('./import-v1/map.ts')
const { buildFilterPlan } = await import('./import-v1/filters.ts')
const { canonicalFieldKey } = await import('../shared/utils/messageFields.ts')
const { buildMessageMatch, messageMatchProblem } = await import('../shared/utils/messageFilters.ts')

function readCsv(name: string) {
  const path = join(dir!, name)
  if (!existsSync(path)) {
    console.error(`${path} not found`)
    process.exit(1)
  }
  return parseCsv(readFileSync(path, 'utf8'))
}

// Which tenant each v1 account became, by its account numbers, as the account import mapped them
let tenantPlan: ReturnType<typeof buildImportPlan>
try {
  tenantPlan = buildImportPlan({ accounts: readCsv('accounts.csv'), users: [], userFilters: [] })
} catch (err) {
  console.error(err instanceof ImportError ? err.message : err)
  process.exit(1)
}
const v1Filters = readCsv('message_filters.csv')
const plan = buildFilterPlan({
  importedAccountIds: tenantPlan.tenants.map(t => t.v1Id),
  users: readCsv('users.csv'),
  filters: v1Filters,
  userFilters: readCsv('users_messagefilters.csv'),
  dynamicFields: readCsv('dynamic_fields.csv')
})

console.info(`Database: ${target.hostname}${target.port ? `:${target.port}` : ''}${target.pathname}`)
console.info(`v1 export: ${v1Filters.length} message filters`)
console.info('')

const pool = createPool({ uri: databaseUrl, timezone: 'Z' })
const db = drizzle({ client: pool, schema, mode: 'default' })
const { tenants, tenantRecordingAccounts, tenantMessageFields, tenantMessageFilters, membershipMessageFilters, memberships, users } = schema

try {
  const v1Accounts = [...new Set(plan.filters.map(f => f.v1AccountId))]
  const numberOf = new Map(tenantPlan.tenants.map(t => [t.v1Id, t.accountNumbers[0]!]))
  const numbers = v1Accounts.map(id => numberOf.get(id)!)
  const tenantRows = numbers.length
    ? await db.select({ accountNumber: tenantRecordingAccounts.accountNumber, tenantId: tenants.id, slug: tenants.slug })
        .from(tenantRecordingAccounts)
        .innerJoin(tenants, eq(tenants.id, tenantRecordingAccounts.tenantId))
        .where(inArray(tenantRecordingAccounts.accountNumber, numbers))
    : []
  const tenantByNumber = new Map(tenantRows.map(row => [row.accountNumber, row]))
  const tenantIds = tenantRows.map(row => row.tenantId)

  const emails = [...new Set(plan.filters.flatMap(f => f.users.map(u => u.email)))]
  const [fieldRows, existingFilters, existingAssignments, userRows, memberRows] = await Promise.all([
    tenantIds.length
      ? db.select({ tenantId: tenantMessageFields.tenantId, fieldKey: tenantMessageFields.fieldKey, orphaned: tenantMessageFields.orphaned })
          .from(tenantMessageFields).where(inArray(tenantMessageFields.tenantId, tenantIds))
      : [],
    tenantIds.length ? db.select().from(tenantMessageFilters).where(inArray(tenantMessageFilters.tenantId, tenantIds)) : [],
    tenantIds.length ? db.select().from(membershipMessageFilters).where(inArray(membershipMessageFilters.tenantId, tenantIds)) : [],
    emails.length
      ? db.select({ id: users.id, email: users.email, disabledAt: users.disabledAt }).from(users).where(inArray(users.email, emails))
      : [],
    tenantIds.length
      ? db.select({ tenantId: memberships.tenantId, userId: memberships.userId }).from(memberships).where(inArray(memberships.tenantId, tenantIds))
      : []
  ])

  const userByEmail = new Map(userRows.map(u => [u.email.toLowerCase(), u]))
  const memberKeys = new Set(memberRows.map(m => `${m.tenantId}:${m.userId}`))
  const assignmentKeys = new Set(existingAssignments.map(a => `${a.tenantId}:${a.userId}:${a.filterId}`))
  // Every filter each member will have, to check au-api's match limits
  const filtersOf = new Map<string, { fieldKey: string, value: string }[]>()
  const filterById = new Map(existingFilters.map(f => [f.id, f]))
  for (const a of existingAssignments) {
    const f = filterById.get(a.filterId)
    if (f) {
      const key = `${a.tenantId}:${a.userId}`
      filtersOf.set(key, [...filtersOf.get(key) ?? [], f])
    }
  }

  const newFilters: typeof tenantMessageFilters.$inferInsert[] = []
  const newAssignments: typeof membershipMessageFilters.$inferInsert[] = []
  const skipped = new Map<string, string[]>()
  const skip = (v1Ids: string[], reason: string) => skipped.set(reason, [...skipped.get(reason) ?? [], ...v1Ids])
  for (const s of plan.skipped) {
    skip([s.v1Id], s.reason)
  }
  // v1 users whose filters were carried over, for re-enabling
  const carried = new Map<string, { v1Id: string, locked: boolean }>()
  const noMembership: string[] = []
  let reusedFilters = 0
  const perTenant = new Map<string, { filters: number, assignments: number }>()

  for (const planned of plan.filters) {
    const tenant = tenantByNumber.get(numberOf.get(planned.v1AccountId)!)
    if (!tenant) {
      skip(planned.v1Ids, `account ${planned.v1AccountId} has no tenant`)
      continue
    }
    // In the message setup's spelling, and still in the script
    const field = fieldRows.find(row => row.tenantId === tenant.tenantId && !row.orphaned
      && canonicalFieldKey(row.fieldKey) === canonicalFieldKey(planned.field))
    if (!field) {
      skip(planned.v1Ids, 'its field isn’t in the tenant’s message setup')
      continue
    }

    const tenantFilters = [...existingFilters, ...newFilters].filter(f => f.tenantId === tenant.tenantId)
    let filter = tenantFilters.find(f => canonicalFieldKey(f.fieldKey) === canonicalFieldKey(field.fieldKey)
      && f.value.trim().toLowerCase() === planned.value.toLowerCase())
    if (filter) {
      reusedFilters++
    } else {
      let name = planned.name
      if (tenantFilters.some(f => f.name.toLowerCase() === name.toLowerCase())) {
        name = `${name} (v1 ${planned.v1Ids[0]})`.slice(0, 255)
      }
      filter = { id: randomUUID(), tenantId: tenant.tenantId, name, fieldKey: field.fieldKey, value: planned.value, updatedByUserId: null }
      newFilters.push(filter)
    }
    const counts = perTenant.get(tenant.slug) ?? { filters: 0, assignments: 0 }
    counts.filters++

    for (const v1User of planned.users) {
      const user = userByEmail.get(v1User.email)
      if (!user || !memberKeys.has(`${tenant.tenantId}:${user.id}`)) {
        noMembership.push(v1User.v1Id)
        continue
      }
      carried.set(user.id, { v1Id: v1User.v1Id, locked: v1User.locked })
      const key = `${tenant.tenantId}:${user.id}:${filter.id!}`
      if (!assignmentKeys.has(key)) {
        assignmentKeys.add(key)
        newAssignments.push({ tenantId: tenant.tenantId, userId: user.id, filterId: filter.id! })
        const memberKey = `${tenant.tenantId}:${user.id}`
        filtersOf.set(memberKey, [...filtersOf.get(memberKey) ?? [], { fieldKey: filter.fieldKey, value: filter.value }])
        counts.assignments++
      }
    }
    perTenant.set(tenant.slug, counts)
  }

  const problems: string[] = []
  for (const [key, filters] of filtersOf) {
    const problem = messageMatchProblem(buildMessageMatch(filters))
    if (problem) {
      problems.push(`member ${key}: ${problem}`)
    }
  }

  // Disabled by the account import for having filters; now filtered here
  const filteredUserIds = new Set([...filtersOf.keys()].map(key => key.split(':')[1]!))
  const toEnable = userRows.filter(u => u.disabledAt && carried.has(u.id) && !carried.get(u.id)!.locked && filteredUserIds.has(u.id))
  const stillLocked = userRows.filter(u => u.disabledAt && carried.get(u.id)?.locked)

  for (const [slug, counts] of perTenant) {
    console.info(`${slug}: ${counts.filters} ${counts.filters === 1 ? 'filter' : 'filters'}, ${counts.assignments} new assignments`)
  }
  console.info('')
  console.info(`Filters:      ${newFilters.length} to create, ${reusedFilters} already imported`)
  console.info(`Assignments:  ${newAssignments.length} to add`)
  console.info(`Re-enable:    ${toEnable.length} users (v1 ${toEnable.map(u => carried.get(u.id)!.v1Id).sort((a, b) => Number(a) - Number(b)).join(', ') || 'none'})`)
  if (stillLocked.length) {
    console.info(`Left disabled: ${stillLocked.length} users locked in v1 (v1 ${stillLocked.map(u => carried.get(u.id)!.v1Id).join(', ')})`)
  }
  if (noMembership.length) {
    console.info(`Not in Insight or not a member of the account, so not assigned: v1 users ${[...new Set(noMembership)].join(', ')}`)
  }
  for (const [reason, ids] of skipped) {
    console.info(`Skipped ${ids.length} × ${reason}: v1 ${ids.join(', ')}`)
  }

  if (problems.length) {
    console.error(`\n${problems.length} member(s) would have more filters than au-api accepts; nothing was written:\n${problems.map(p => `  - ${p}`).join('\n')}`)
    process.exitCode = 1
  } else if (!apply) {
    console.info('\nDry run: nothing written. Re-run with --apply to import.')
  } else if (!newFilters.length && !newAssignments.length && !toEnable.length) {
    console.info('\nNothing to import.')
  } else {
    await db.transaction(async (tx) => {
      if (newFilters.length) {
        await tx.insert(tenantMessageFilters).values(newFilters)
      }
      if (newAssignments.length) {
        await tx.insert(membershipMessageFilters).values(newAssignments)
      }
      if (toEnable.length) {
        await tx.update(users).set({ disabledAt: null })
          .where(and(inArray(users.id, toEnable.map(u => u.id)), isNotNull(users.disabledAt)))
      }
    })
    console.info(`\nImported. ${toEnable.length} users re-enabled; they sign in with "Email me a sign-in link".`)
  }
} finally {
  await pool.end()
}
