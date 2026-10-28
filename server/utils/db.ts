import { drizzle } from 'drizzle-orm/mysql2'
import type { MySql2Database } from 'drizzle-orm/mysql2'
import { createPool } from 'mysql2/promise'
import * as schema from '../db/schema'

export { schema as tables }

let db: MySql2Database<typeof schema> | undefined

export function useDb() {
  if (!db) {
    const { databaseUrl } = useRuntimeConfig()
    if (!databaseUrl) {
      throw new Error('NUXT_DATABASE_URL is not set')
    }
    db = drizzle({
      // Store and read all datetimes as UTC
      client: createPool({ uri: databaseUrl, connectionLimit: 10, timezone: 'Z' }),
      schema,
      mode: 'default'
    })
  }
  return db
}

export type DbUser = typeof schema.users.$inferSelect
export type DbTenant = typeof schema.tenants.$inferSelect
