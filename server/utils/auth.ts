import { and, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * nuxt-auth-utils 0.6 types its session hooks and WebAuthn callbacks with
 * `nuxt/server`'s portable RequestEvent. On Nuxt 4 (Nitro 2) the event it
 * passes is still the request's h3 event, which requireUser(), startSession()
 * and the rate limits read; anything else is refused rather than guessed at.
 */
export function requestH3Event(event: unknown): H3Event {
  const h3 = event as Partial<H3Event>
  if (!h3?.node?.req || !h3.context) {
    throw createError({ statusCode: 500, message: 'Sign-in isn’t available right now' })
  }
  return h3 as H3Event
}

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
 * Whether a session's sign-in is within the session lifetime. The cookie's own
 * expiry renews whenever the session is written, so this is what ends a
 * sign-in: 30 days after it happened, however it's been used since.
 */
export function signInStillValid(loggedInAt: unknown, maxAgeSeconds: number, now = Date.now()) {
  return typeof loggedInAt === 'number' && loggedInAt <= now && now - loggedInAt < maxAgeSeconds * 1000
}

/**
 * Loads the session's user from the database. Rejects disabled users, sessions
 * issued before the user's sessionVersion was bumped, and sign-ins older than
 * the session lifetime.
 */
export async function requireUser(event: H3Event): Promise<DbUser> {
  if (event.context.user) {
    return event.context.user
  }

  const session = await requireUserSession(event)
  const user = await useDb().query.users.findFirst({ where: eq(tables.users.id, session.user.id) })
  const maxAge = Number(useRuntimeConfig().session.maxAge)

  if (!user || user.disabledAt || user.sessionVersion !== session.secure?.sessionVersion
    || !signInStillValid(session.loggedInAt, maxAge)) {
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

/** The email domains platform admins must be at (runtime config, comma-separated) */
export function platformAdminDomains() {
  const domains = parseEmailDomains(useRuntimeConfig().platformAdminDomains)
  return domains.length ? domains : parseEmailDomains(DEFAULT_PLATFORM_ADMIN_DOMAINS)
}
