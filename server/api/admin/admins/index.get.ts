import { asc, eq } from 'drizzle-orm'

// Every platform admin, for /admin/admins, flagging any made before the
// domain rule whose address is outside it
export default defineEventHandler(async (event) => {
  await requirePlatformAdmin(event)
  const domains = platformAdminDomains()

  const admins = await useDb()
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
  return {
    domains,
    admins: admins.map(admin => ({ ...admin, allowedDomain: emailDomainAllowed(admin.email, domains) }))
  }
})
