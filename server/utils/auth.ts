import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

export function toSessionUser(user: DbUser) {
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    isPlatformAdmin: user.isPlatformAdmin,
    timezone: user.timezone
  }
}

/** Replaces the current session with a fresh one for `user` */
export async function startSession(event: H3Event, user: DbUser) {
  await replaceUserSession(event, {
    user: toSessionUser(user),
    secure: { sessionVersion: user.sessionVersion },
    loggedInAt: Date.now()
  })
  await useDb().update(tables.users).set({ lastLoginAt: new Date() }).where(eq(tables.users.id, user.id))
}

export async function findUserByEmail(email: string) {
  return useDb().query.users.findFirst({ where: eq(tables.users.email, normalizeEmail(email)) })
}

/**
 * Loads the session's user from the database. Rejects disabled users and sessions
 * issued before the user's sessionVersion was bumped.
 */
export async function requireUser(event: H3Event): Promise<DbUser> {
  if (event.context.user) {
    return event.context.user
  }

  const session = await requireUserSession(event)
  const user = await useDb().query.users.findFirst({ where: eq(tables.users.id, session.user.id) })

  if (!user || user.disabledAt || user.sessionVersion !== session.secure?.sessionVersion) {
    await clearUserSession(event)
    throw createError({ statusCode: 401, message: 'Your session has expired. Please sign in again.' })
  }

  event.context.user = user
  return user
}

export async function requirePlatformAdmin(event: H3Event) {
  const user = await requireUser(event)
  if (!user.isPlatformAdmin) {
    throw createError({ statusCode: 403, message: 'Forbidden' })
  }
  return user
}

/**
 * Ensures the current user has at least `minRole` in the tenant.
 * Platform admins are treated as owners of every tenant.
 */
export async function requireTenantRole(event: H3Event, tenantId: string, minRole: Role) {
  const user = await requireUser(event)
  const db = useDb()

  const tenant = await db.query.tenants.findFirst({ where: eq(tables.tenants.id, tenantId) })
  const membership = tenant && await db.query.memberships.findFirst({
    where: and(eq(tables.memberships.tenantId, tenant.id), eq(tables.memberships.userId, user.id))
  })
  const role: Role | undefined = user.isPlatformAdmin ? 'owner' : membership?.role

  // Respond with 404 so non-members can't probe for tenant IDs
  if (!tenant || !role) {
    throw createError({ statusCode: 404, message: 'Tenant not found' })
  }
  if (!canOpenTenant(tenant.status, user.isPlatformAdmin)) {
    const message = tenant.status === 'setup'
      ? 'This account is still being set up. You’ll be able to open it once Answer United finishes.'
      : 'This account is suspended'
    throw createError({ statusCode: 403, message })
  }
  if (!hasRole(role, minRole)) {
    throw createError({ statusCode: 403, message: 'You do not have permission to do that' })
  }

  return { user, tenant, role }
}

declare module 'h3' {
  interface H3EventContext {
    user?: DbUser
  }
}
