// One-off import of the v1 Insight export (accounts, users) into this database.
// Usage: pnpm import:v1 <export-dir> [--apply]
//
// Dry run by default: reads the CSVs, checks them against the database and
// prints what it would do. --apply writes it all in one transaction. Re-running
// is safe: tenants and users already imported are reused, not duplicated.
// Sends no email. Prints counts and v1 ids only, never emails or names.
// See docs/DEPLOYMENT.md, "One-off v1 import".
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { inArray } from 'drizzle-orm'
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
  console.error('Usage: pnpm import:v1 <export-dir> [--apply]')
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

function readCsv(name: string) {
  const path = join(dir!, name)
  if (!existsSync(path)) {
    console.error(`${path} not found`)
    process.exit(1)
  }
  return parseCsv(readFileSync(path, 'utf8'))
}

const input = {
  accounts: readCsv('accounts.csv'),
  users: readCsv('users.csv'),
  userFilters: readCsv('users_messagefilters.csv')
}

let plan: ReturnType<typeof buildImportPlan>
try {
  plan = buildImportPlan(input)
} catch (err) {
  console.error(err instanceof ImportError ? err.message : err)
  process.exit(1)
}

console.info(`Database: ${target.hostname}${target.port ? `:${target.port}` : ''}${target.pathname}`)
console.info(`v1 export: ${input.accounts.length} accounts, ${input.users.length} users`)
for (const skipped of plan.skippedAccounts) {
  console.info(`Skipping account ${skipped.v1Id} and its ${skipped.users} users: ${skipped.reason}`)
}
const otherSkips = plan.skippedUsers.filter(u => !u.reason.startsWith('account '))
for (const skipped of otherSkips) {
  console.info(`Skipping user ${skipped.v1Id}: ${skipped.reason}`)
}
for (const warning of plan.warnings) {
  console.info(`Note: ${warning}`)
}

const pool = createPool({ uri: databaseUrl, timezone: 'Z' })
const db = drizzle({ client: pool, schema, mode: 'default' })
const { tenants, tenantRecordingAccounts, users, memberships } = schema

try {
  // What's already in the database
  const slugs = plan.tenants.map(t => t.slug)
  const numbers = plan.tenants.flatMap(t => t.accountNumbers)
  const emails = plan.users.map(u => u.email)
  const existingTenants = slugs.length
    ? await db.select({ id: tenants.id, slug: tenants.slug }).from(tenants).where(inArray(tenants.slug, slugs))
    : []
  const existingNumbers = numbers.length
    ? await db.select().from(tenantRecordingAccounts).where(inArray(tenantRecordingAccounts.accountNumber, numbers))
    : []
  const existingUsers = emails.length
    ? await db.select({ id: users.id, email: users.email }).from(users).where(inArray(users.email, emails))
    : []
  const existingMemberships = existingUsers.length
    ? await db.select({ tenantId: memberships.tenantId, userId: memberships.userId }).from(memberships)
        .where(inArray(memberships.userId, existingUsers.map(u => u.id)))
    : []

  const tenantIdBySlug = new Map(existingTenants.map(t => [t.slug, t.id]))
  const numberOwner = new Map(existingNumbers.map(n => [n.accountNumber, n.tenantId]))
  const userIdByEmail = new Map(existingUsers.map(u => [u.email.toLowerCase(), u.id]))
  const memberKeys = new Set(existingMemberships.map(m => `${m.tenantId}:${m.userId}`))

  // Tenants: new, already imported (same slug and account numbers), or a conflict
  const tenantIdByV1Id = new Map<string, string>()
  const newTenants: typeof tenants.$inferInsert[] = []
  const newNumbers: typeof tenantRecordingAccounts.$inferInsert[] = []
  const conflicts: string[] = []
  let alreadyImported = 0
  for (const tenant of plan.tenants) {
    const existingId = tenantIdBySlug.get(tenant.slug)
    if (existingId) {
      if (tenant.accountNumbers.every(n => numberOwner.get(n) === existingId)) {
        tenantIdByV1Id.set(tenant.v1Id, existingId)
        alreadyImported++
      } else {
        conflicts.push(`account ${tenant.v1Id}: its URL slug is taken by an account with other account numbers`)
      }
      continue
    }
    if (tenant.accountNumbers.some(n => numberOwner.has(n))) {
      conflicts.push(`account ${tenant.v1Id}: its account number already belongs to another account`)
      continue
    }
    const id = randomUUID()
    tenantIdByV1Id.set(tenant.v1Id, id)
    newTenants.push({ id, name: tenant.name, slug: tenant.slug, status: 'active', timezone: tenant.timezone, recordingHistoryDays: tenant.historyDays })
    newNumbers.push(...tenant.accountNumbers.map(accountNumber => ({ accountNumber, tenantId: id })))
  }

  // Users: existing ones (same email) are left as they are and only gain the membership
  const newUsers: typeof users.$inferInsert[] = []
  const newMemberships: typeof memberships.$inferInsert[] = []
  let reusedUsers = 0
  let usersOfConflicts = 0
  for (const user of plan.users) {
    const tenantId = tenantIdByV1Id.get(user.v1AccountId)
    if (!tenantId) {
      usersOfConflicts++
      continue
    }
    let userId = userIdByEmail.get(user.email)
    if (userId) {
      reusedUsers++
    } else {
      userId = randomUUID()
      newUsers.push({ id: userId, email: user.email, name: user.name, timezone: user.timezone, disabledAt: user.disabled ? new Date() : null })
    }
    if (!memberKeys.has(`${tenantId}:${userId}`)) {
      newMemberships.push({ tenantId, userId, role: 'viewer' })
    }
  }

  const disabled = newUsers.filter(u => u.disabledAt).length
  console.info('')
  console.info(`Tenants:         ${newTenants.length} to create (active, ${plan.tenants[0]?.historyDays ?? 365} days of history), ${alreadyImported} already imported`)
  console.info(`Account numbers: ${newNumbers.length} to add`)
  console.info(`Users:           ${newUsers.length} to create (${disabled} disabled), ${reusedUsers} already in Insight`)
  console.info(`Memberships:     ${newMemberships.length} to add, all as viewer`)
  for (const conflict of conflicts) {
    console.info(`Conflict: ${conflict}`)
  }
  if (conflicts.length) {
    console.error(`\n${conflicts.length} account(s) conflict with existing data (${usersOfConflicts} users). Resolve them in /admin/tenants first; nothing was written.`)
    process.exitCode = 1
  } else if (!apply) {
    console.info('\nDry run: nothing written. Re-run with --apply to import.')
  } else if (!newTenants.length && !newUsers.length && !newMemberships.length) {
    console.info('\nNothing to import.')
  } else {
    await db.transaction(async (tx) => {
      const chunks = <T>(rows: T[]) => Array.from({ length: Math.ceil(rows.length / 200) }, (_, i) => rows.slice(i * 200, i * 200 + 200))
      for (const rows of chunks(newTenants)) await tx.insert(tenants).values(rows)
      for (const rows of chunks(newNumbers)) await tx.insert(tenantRecordingAccounts).values(rows)
      for (const rows of chunks(newUsers)) await tx.insert(users).values(rows)
      for (const rows of chunks(newMemberships)) await tx.insert(memberships).values(rows)
    })
    console.info('\nImported. No email was sent; people sign in with "Email me a sign-in link".')
  }
} finally {
  await pool.end()
}
