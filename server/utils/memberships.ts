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

  const { user: actor, role: actorRole } = await requireTenantRole(event, tenantId, 'viewer')
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

  if (target.role === 'owner' && newRole !== 'owner') {
    const [row] = await db.select({ owners: count() })
      .from(tables.memberships)
      .where(and(eq(tables.memberships.tenantId, tenantId), eq(tables.memberships.role, 'owner')))
    if ((row?.owners ?? 0) <= 1) {
      throw createError({ statusCode: 400, message: 'A tenant must have at least one owner' })
    }
  }

  return { tenantId, targetUserId }
}
