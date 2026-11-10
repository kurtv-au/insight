import { asc, eq } from 'drizzle-orm'

// Every platform admin, for /admin/admins
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)

  return useDb()
    .select({
      id: tables.users.id,
      name: tables.users.name,
      email: tables.users.email,
      lastLoginAt: tables.users.lastLoginAt,
      createdAt: tables.users.createdAt
    })
    .from(tables.users)
    .where(eq(tables.users.isPlatformAdmin, true))
    .orderBy(asc(tables.users.name), asc(tables.users.email))
})
