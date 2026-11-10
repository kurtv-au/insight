// Creates a platform admin, or promotes an existing user to one.
// Usage: pnpm admin:create <email> [name]
import { existsSync } from 'node:fs'
import { eq } from 'drizzle-orm'
import { drizzle } from 'drizzle-orm/mysql2'
import { createPool } from 'mysql2/promise'
import * as schema from '../server/db/schema.ts'
import { DEFAULT_PLATFORM_ADMIN_DOMAINS, describeEmailDomains, emailDomainAllowed, parseEmailDomains } from '../shared/utils/platformAdmins.ts'

if (existsSync('.env')) {
  process.loadEnvFile('.env')
}

const [rawEmail, name = ''] = process.argv.slice(2)
const email = rawEmail?.trim().toLowerCase()
if (!email || !email.includes('@')) {
  console.error('Usage: pnpm admin:create <email> [name]')
  process.exit(1)
}

// The same rule as the Platform admins page
const domains = parseEmailDomains(process.env.NUXT_PLATFORM_ADMIN_DOMAINS)
const allowed = domains.length ? domains : parseEmailDomains(DEFAULT_PLATFORM_ADMIN_DOMAINS)
if (!emailDomainAllowed(email, allowed)) {
  console.error(`Platform admins need an ${describeEmailDomains(allowed)} address (NUXT_PLATFORM_ADMIN_DOMAINS).`)
  process.exit(1)
}

const databaseUrl = process.env.NUXT_DATABASE_URL
if (!databaseUrl) {
  console.error('NUXT_DATABASE_URL is not set')
  process.exit(1)
}

const pool = createPool({ uri: databaseUrl, timezone: 'Z' })
const db = drizzle({ client: pool, schema, mode: 'default' })

try {
  const existing = await db.query.users.findFirst({ where: eq(schema.users.email, email) })
  if (existing) {
    await db.update(schema.users).set({ isPlatformAdmin: true }).where(eq(schema.users.id, existing.id))
    console.info(`Promoted ${email} to platform admin.`)
  } else {
    await db.insert(schema.users).values({ email, name, isPlatformAdmin: true })
    console.info(`Created platform admin ${email}.`)
  }
  console.info('Sign in with "Email me a sign-in link" on the login page.')
} finally {
  await pool.end()
}
