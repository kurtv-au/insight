/**
 * Applies pending migrations: the production counterpart of `pnpm db:migrate`.
 *
 * The instance has no drizzle-kit, pnpm or source, only the release tarball,
 * so `scripts/build-release.sh` bundles this file with esbuild into a single
 * `migrate.mjs` next to `server/db/migrations/`. drizzle-orm's migrator keeps
 * its ledger in the same `__drizzle_migrations` table drizzle-kit writes, so
 * the two are interchangeable against one database.
 *
 *   node --env-file=/opt/insight/shared/.env migrate.mjs
 *
 * Run by `deploy/activate.sh` before the new release starts, never on boot.
 * The connection is made exactly like the app's (server/utils/db.ts), so TLS
 * options in the URL apply to both.
 */
import { fileURLToPath } from 'node:url'
import { drizzle } from 'drizzle-orm/mysql2'
import { migrate } from 'drizzle-orm/mysql2/migrator'
import { createPool } from 'mysql2/promise'

const url = process.env.NUXT_DATABASE_URL
if (!url) {
  console.error('[migrate] NUXT_DATABASE_URL is not set')
  process.exit(1)
}

const migrationsFolder = process.env.MIGRATIONS_DIR
  ?? fileURLToPath(new URL('./server/db/migrations', import.meta.url))

const pool = createPool({ uri: url, connectionLimit: 1, timezone: 'Z' })

try {
  // The pool positionally: drizzle() only reads `{ client }` as a config when
  // it also has a schema, and the migrator needs none
  await migrate(drizzle(pool), { migrationsFolder })
  const [rows] = await pool.query('select count(*) as count from `__drizzle_migrations`')
  const count = (rows as { count: number }[])[0]?.count ?? '?'
  console.info(`[migrate] up to date: ${count} migrations applied`)
} catch (error) {
  console.error('[migrate] failed:', error)
  process.exitCode = 1
} finally {
  await pool.end()
}
