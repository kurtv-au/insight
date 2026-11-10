import { and, count, eq } from 'drizzle-orm'
import type { H3Event } from 'h3'

/**
 * Loads a membership the current user wants to change or remove and enforces the
 * shared rules: only owners can manage owners (or grant ownership), and a tenant
 * must always keep at least one owner. Members may always remove themselves.
 */
export async function requireManageableMember(event: H3Event, { newRole }: { newRole?: Role } = {}) {
  const tenantId = getRouterParam(event, 'tenantId')!
  const targetUserId = getRouterParam(event, 'userId')!

  const { user: actor, role: actorRole, tenant } = await requireTenantRole(event, tenantId, 'viewer')
  const isSelfRemoval = !newRole && actor.id === targetUserId
  if (!isSelfRemoval && !hasRole(actorRole, 'admin')) {
    throw createError({ statusCode: 403, message: 'You do not have permission to do that' })
  }

  const db = useDb()
  const target = await db.query.memberships.findFirst({
    where: and(eq(tables.memberships.tenantId, tenantId), eq(tables.memberships.userId, targetUserId))
  })
  if (!target) {
    throw createError({ statusCode: 404, message: 'Member not found' })
  }

  if (!isSelfRemoval && (target.role === 'owner' || newRole === 'owner') && actorRole !== 'owner') {
    throw createError({ statusCode: 403, message: 'Only owners can manage owners' })
  }

  // A filtered member stays a viewer (see assertFilterableRole())
  if (newRole && newRole !== 'viewer' && target.role === 'viewer') {
    const [filtered] = await db.select({ filters: count() })
      .from(tables.membershipMessageFilters)
      .where(and(eq(tables.membershipMessageFilters.tenantId, tenantId), eq(tables.membershipMessageFilters.userId, targetUserId)))
    if ((filtered?.filters ?? 0) > 0) {
      throw createError({ statusCode: 400, message: 'Remove their message filters before making them an admin or owner' })
    }
  }

  if (target.role === 'owner' && newRole !== 'owner') {
    const [row] = await db.select({ owners: count() })
      .from(tables.memberships)
      .where(and(eq(tables.memberships.tenantId, tenantId), eq(tables.memberships.role, 'owner')))
    if ((row?.owners ?? 0) <= 1) {
      throw createError({ statusCode: 400, message: 'A tenant must have at least one owner' })
    }
  }

  return { tenantId, targetUserId, target, actor, tenant, isSelfRemoval }
}

/**
 * Loads a member whose message filters the current user wants to change: an
 * admin or owner of the tenant, and only an owner for an owner. Nobody but a
 * platform admin changes their own filters, since removing them would widen
 * what they can see. Only a viewer can be given filters (see
 * `assertFilterableRole()`), checked once the body is read.
 */
export async function requireFilterableMember(event: H3Event) {
  const tenantId = getRouterParam(event, 'tenantId')!
  const targetUserId = getRouterParam(event, 'userId')!

  const { user: actor, role: actorRole, tenant } = await requireTenantRole(event, tenantId, 'admin')
  if (actor.id === targetUserId && !actor.isPlatformAdmin) {
    throw createError({ statusCode: 403, message: 'Someone else on the account has to change your filters' })
  }

  const target = await useDb().query.memberships.findFirst({
    where: and(eq(tables.memberships.tenantId, tenantId), eq(tables.memberships.userId, targetUserId))
  })
  if (!target) {
    throw createError({ statusCode: 404, message: 'Member not found' })
  }
  if (target.role === 'owner' && actorRole !== 'owner') {
    throw createError({ statusCode: 403, message: 'Only owners can manage owners' })
  }
  return { tenantId, targetUserId, actor, target, tenant }
}

/**
 * Message filters only bind viewers. Admins and owners manage filters and
 * invitations, so they could edit their own filter or invite themselves again
 * unfiltered: a filter on them would only look like a restriction.
 */
export function assertFilterableRole(role: Role, filterIds: readonly string[]) {
  if (filterIds.length && role !== 'viewer') {
    throw createError({ statusCode: 400, message: 'Message filters apply to viewers. Make them a viewer first.' })
  }
}

/** A member's email, for the audit log */
export async function memberEmail(userId: string) {
  const user = await useDb().query.users.findFirst({ where: eq(tables.users.id, userId), columns: { email: true } })
  return user?.email ?? userId
}
